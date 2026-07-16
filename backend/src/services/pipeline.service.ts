import prisma from '../prisma/client';
import { Task } from '@prisma/client';
import { notifyStepAdvanced, notifyTaskAssigned, notifyClientStatusChanged } from './notify.service';

export function computeClientStatus(
  tasks: Pick<Task, 'status' | 'dueDate'>[]
): 'on_track' | 'due_today' | 'overdue' | 'blocked' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const activeTasks = tasks.filter(
    (t) => t.status !== 'complete' && t.status !== 'cancelled'
  );

  if (activeTasks.some((t) => t.status === 'blocked')) return 'blocked';
  if (activeTasks.some((t) => new Date(t.dueDate) < today)) return 'overdue';
  if (
    activeTasks.some((t) => {
      const due = new Date(t.dueDate);
      return due >= today && due < tomorrow;
    })
  )
    return 'due_today';
  return 'on_track';
}

export async function advanceClientToStep(
  clientId: string,
  toStepId: string,
  triggeredBy: 'system' | 'admin',
  triggeredByUserId?: string,
  reasonNote?: string
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error('Client not found');

  const toStep = await prisma.step.findUnique({
    where: { id: toStepId },
    include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!toStep) throw new Error('Step not found');

  // Find team members for the owning team — includes team_leader so the
  // leader participates in round-robin task assignment alongside members.
  const teamMembers = await prisma.user.findMany({
    where: {
      organisationId: client.organisationId,
      teamName: toStep.owningTeamName,
      isActive: true,
      role: { in: ['team_member', 'team_leader', 'admin'] },
    },
  });

  if (teamMembers.length === 0) {
    // Fall back to any admin
    const admins = await prisma.user.findMany({
      where: { organisationId: client.organisationId, role: 'admin', isActive: true },
    });
    if (admins.length === 0) {
      // Don't throw — let the notification layer flag the orphan team to admins.
      console.warn(`[pipeline] No team members or admins for team: ${toStep.owningTeamName} (client ${clientId})`);
    } else {
      teamMembers.push(...admins);
    }
  }

  // Lookup who triggered this (for notification message)
  let triggeredByName: string | undefined;
  if (triggeredByUserId) {
    const actor = await prisma.user.findUnique({ where: { id: triggeredByUserId }, select: { fullName: true } });
    triggeredByName = actor?.fullName;
  }

  const now = new Date();
  const clientName = client.brandName || client.fullName;

  // Create step history
  await prisma.stepHistory.create({
    data: {
      organisationId: client.organisationId,
      clientId,
      fromStepId: client.currentStepId,
      toStepId,
      triggeredBy,
      triggeredByUserId,
      reasonNote,
    },
  });

  // Update client
  await prisma.client.update({
    where: { id: clientId },
    data: { currentStepId: toStepId, stepEnteredAt: now },
  });

  // ── NOTIFY: step advanced → whole owning team + all admins ──────────
  void notifyStepAdvanced({
    organisationId: client.organisationId,
    clientName,
    stepNumber: toStep.stepNumber,
    stepName: toStep.name,
    owningTeamName: toStep.owningTeamName,
    triggeredBy,
    triggeredByName,
    clientId,
  }).catch((err) => console.error('[advance] step advanced notification broadcast failed:', err));

  // Get active task counts for round-robin load balancing
  const taskCounts = await Promise.all(
    teamMembers.map(async (m) => {
      const count = await prisma.task.count({
        where: {
          assignedToId: m.id,
          status: { in: ['pending', 'in_progress'] },
        },
      });
      return { member: m, count };
    })
  );

  // Create tasks from template
  const tasks = [];

  const teamLeader = teamMembers.find(m => m.role === 'team_leader');

  for (let i = 0; i < toStep.taskTemplates.length; i++) {
    const template = toStep.taskTemplates[i];
    
    // Pick assignee: team leader first, otherwise least loaded member
    let assignee = teamLeader;
    if (!assignee) {
      taskCounts.sort((a, b) => a.count - b.count);
      assignee = taskCounts[i % taskCounts.length].member;
      taskCounts[i % taskCounts.length].count++;
    }

    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + template.relativeDueDay);

    const task = await prisma.task.create({
      data: {
        organisationId: client.organisationId,
        clientId,
        stepId: toStepId,
        templateTaskId: template.id,
        assignedToId: assignee.id,
        title: template.title,
        description: template.description,
        priority: template.priority,
        dueDate,
        status: 'pending',
      },
    });
    tasks.push(task);

    // ── NOTIFY: task assigned → individual assignee ──────────────────
    void notifyTaskAssigned({
      organisationId: client.organisationId,
      assigneeId: assignee.id,
      taskTitle: template.title,
      clientName,
      taskId: task.id,
    }).catch((err) => console.error('[advance] task-assigned notification failed:', err));
  }

  const updatedClient = await prisma.client.findUnique({ where: { id: clientId } });
  return { client: updatedClient, tasks };
}

export async function checkAutoAdvancement(clientId: string, stepId: string) {
  const pendingCount = await prisma.task.count({
    where: {
      clientId,
      stepId,
      status: { notIn: ['complete', 'cancelled'] },
    },
  });

  if (pendingCount === 0) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { currentStep: true },
    });
    if (!client) return { advanced: false };

    const nextStep = await prisma.step.findFirst({
      where: {
        organisationId: client.organisationId,
        clientId: client.id,
        stepNumber: client.currentStep.stepNumber + 1,
        isActive: true,
      },
    });

    if (nextStep) {
      await advanceClientToStep(clientId, nextStep.id, 'system');
      return { advanced: true, nextStep };
    } else {
      // All 9 steps done — mark completed and broadcast to all teams + admins.
      // The broadcast is fire-and-forget: it writes a notification per org
      // user which can take a few seconds; we don't want to block the
      // PATCH /api/tasks/:id/complete response on that work. The status
      // flip itself (the part the user sees) is awaited below.
      const previousStatus = client.status;
      await prisma.client.update({
        where: { id: clientId },
        data: { status: 'completed' },
      });

      // NOTIFY: auto-completion → all teams + admins (background)
      void notifyClientStatusChanged({
        organisationId: client.organisationId,
        clientName: client.brandName || client.fullName,
        oldStatus: previousStatus,
        newStatus: 'completed',
        clientId: client.id,
      }).catch((err) => console.error('[auto-complete] notification broadcast failed:', err));

      return { advanced: false, completed: true };
    }
  }

  return { advanced: false };
}

export async function handleManualStepMove(
  clientId: string,
  toStepId: string,
  adminUserId: string,
  reasonNote: string,
  direction: 'forward' | 'backward'
) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) throw new Error('Client not found');

  if (direction === 'forward') {
    // Cancel all incomplete tasks in current step
    await prisma.task.updateMany({
      where: {
        clientId,
        stepId: client.currentStepId,
        status: { notIn: ['complete', 'cancelled'] },
      },
      data: { status: 'cancelled' },
    });
  } else {
    // Backward: cancel current + target step tasks (fresh start)
    await prisma.task.updateMany({
      where: {
        clientId,
        stepId: client.currentStepId,
        status: { notIn: ['complete', 'cancelled'] },
      },
      data: { status: 'cancelled' },
    });
    await prisma.task.updateMany({
      where: { clientId, stepId: toStepId },
      data: { status: 'cancelled' },
    });
  }

  return advanceClientToStep(clientId, toStepId, 'admin', adminUserId, reasonNote);
}

export const DEFAULT_12_STEPS = [
  {
    stepNumber: 1,
    name: 'Client Onboarding',
    owningTeamName: 'Intake Team',
    slaDays: 3,
    templates: [
      { title: 'Collect client details', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Collect brand assets', relativeDueDay: 2, sortOrder: 2 },
      { title: 'Send welcome message', relativeDueDay: 1, sortOrder: 3 },
      { title: 'Create client folder', relativeDueDay: 2, sortOrder: 4 },
    ],
  },
  {
    stepNumber: 2,
    name: 'Strategy Call',
    owningTeamName: 'Sales Team',
    slaDays: 5,
    templates: [
      { title: 'Schedule discovery call', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Conduct strategy call', relativeDueDay: 3, sortOrder: 2 },
      { title: 'Define offer and pricing', relativeDueDay: 4, sortOrder: 3 },
      { title: 'Confirm niche and target audience', relativeDueDay: 5, sortOrder: 4 },
    ],
  },
  {
    stepNumber: 3,
    name: 'Brand Setup',
    owningTeamName: 'Design Team',
    slaDays: 7,
    templates: [
      { title: 'Create logo variations', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Define colour palette', relativeDueDay: 2, sortOrder: 2 },
      { title: 'Design social media templates', relativeDueDay: 5, sortOrder: 3 },
      { title: 'Create brand guidelines PDF', relativeDueDay: 7, sortOrder: 4 },
    ],
  },
  {
    stepNumber: 4,
    name: 'Funnel Build',
    owningTeamName: 'Tech Team',
    slaDays: 10,
    templates: [
      { title: 'Set up domain and SSL', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Build landing page', relativeDueDay: 6, sortOrder: 2 },
      { title: 'Configure payment gateway', relativeDueDay: 7, sortOrder: 3 },
      { title: 'Build thank-you page', relativeDueDay: 8, sortOrder: 4 },
      { title: 'Set up registration form', relativeDueDay: 9, sortOrder: 5 },
    ],
  },
  {
    stepNumber: 5,
    name: 'Ad Creative',
    owningTeamName: 'Creative Team',
    slaDays: 7,
    templates: [
      { title: 'Write ad copy variants', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Design static ad creatives', relativeDueDay: 5, sortOrder: 2 },
      { title: 'Produce video ad or reel', relativeDueDay: 7, sortOrder: 3 },
    ],
  },
  {
    stepNumber: 6,
    name: 'Ad Launch',
    owningTeamName: 'Media Buyer',
    slaDays: 5,
    templates: [
      { title: 'Set up Meta ad campaign', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Define targeting and audience', relativeDueDay: 2, sortOrder: 2 },
      { title: 'Set budget and schedule', relativeDueDay: 3, sortOrder: 3 },
      { title: 'Go live and monitor', relativeDueDay: 5, sortOrder: 4 },
    ],
  },
  {
    stepNumber: 7,
    name: 'Automation Setup',
    owningTeamName: 'Automation Team',
    slaDays: 5,
    templates: [
      { title: 'Configure email sequences', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Set up WhatsApp automation', relativeDueDay: 3, sortOrder: 2 },
      { title: 'Configure CRM tagging', relativeDueDay: 5, sortOrder: 3 },
    ],
  },
  {
    stepNumber: 8,
    name: 'Event Preparation',
    owningTeamName: 'Event Team',
    slaDays: 7,
    templates: [
      { title: 'Set up webinar platform', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Create event materials', relativeDueDay: 4, sortOrder: 2 },
      { title: 'Brief the coach', relativeDueDay: 5, sortOrder: 3 },
      { title: 'Conduct dry run', relativeDueDay: 7, sortOrder: 4 },
    ],
  },
  {
    stepNumber: 9,
    name: 'Event Launch',
    owningTeamName: 'Intake Team',
    slaDays: 1,
    templates: [
      { title: 'Execute live event', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Provide real-time support', relativeDueDay: 1, sortOrder: 2 },
      { title: 'Trigger post-event sequence', relativeDueDay: 1, sortOrder: 3 },
    ],
  },
  {
    stepNumber: 10,
    name: 'Feedback & Optimization',
    owningTeamName: 'Media Buyer',
    slaDays: 5,
    templates: [
      { title: 'Review ad performance', relativeDueDay: 2, sortOrder: 1 },
      { title: 'Optimize target audience', relativeDueDay: 3, sortOrder: 2 },
      { title: 'Adjust budgets', relativeDueDay: 5, sortOrder: 3 },
    ],
  },
  {
    stepNumber: 11,
    name: 'Client Offboarding/Review',
    owningTeamName: 'Sales Team',
    slaDays: 3,
    templates: [
      { title: 'Conduct review call', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Gather client testimonial', relativeDueDay: 2, sortOrder: 2 },
      { title: 'Prepare performance report', relativeDueDay: 3, sortOrder: 3 },
    ],
  },
  {
    stepNumber: 12,
    name: 'Project Handover',
    owningTeamName: 'Intake Team',
    slaDays: 2,
    templates: [
      { title: 'Hand over assets', relativeDueDay: 1, sortOrder: 1 },
      { title: 'Archive folders', relativeDueDay: 2, sortOrder: 2 },
      { title: 'Final billing check', relativeDueDay: 2, sortOrder: 3 },
    ],
  },
];

export async function initializeClientPipeline(
  clientId: string,
  organisationId: string,
  userId: string,
  startingStepNumber: number = 1
) {
  // Create 12 default steps for this client
  let startingStepId = '';
  for (const s of DEFAULT_12_STEPS) {
    const createdStep = await prisma.step.create({
      data: {
        organisationId,
        clientId,
        stepNumber: s.stepNumber,
        name: s.name,
        owningTeamName: s.owningTeamName,
        slaDays: s.slaDays,
        isActive: true,
      },
    });

    if (s.stepNumber === startingStepNumber) {
      startingStepId = createdStep.id;
    }

    // Create templates for this step
    for (const t of s.templates) {
      await prisma.stepTaskTemplate.create({
        data: {
          stepId: createdStep.id,
          organisationId,
          title: t.title,
          relativeDueDay: t.relativeDueDay,
          sortOrder: t.sortOrder,
          priority: 'normal',
        },
      });
    }
  }

  // Update client with the real startingStepId
  await prisma.client.update({
    where: { id: clientId },
    data: { currentStepId: startingStepId },
  });

  // Auto-advance to the starting step (creates tasks + notifications)
  await advanceClientToStep(clientId, startingStepId, 'admin', userId, 'Client created');
  
  return startingStepId;
}

export async function importClientWithCustomPipeline(
  clientData: {
    fullName: string;
    email?: string | null;
    whatsappNumber?: string | null;
    dateJoined?: Date;
    notes?: string | null;
    aliases?: string[];
  },
  taskStatuses: Record<string, any>,
  organisationId: string,
  adminUserId: string
) {
  // ─── Pipeline definition (maps Excel columns → steps) ────────────────────
  // Each step groups logically related Excel columns as sub-tasks.
  const PIPELINE_MAPPING = [
    {
      stepNumber: 1, name: 'Client Onboarding', owningTeamName: 'Intake Team', slaDays: 3,
      columns: ['Onboarding', 'WA Group', 'CRM Setup', 'Doc', 'doc'],
    },
    {
      stepNumber: 2, name: 'Strategy Call', owningTeamName: 'Sales Team', slaDays: 5,
      columns: ['Micro Niche', 'Offer', 'Challenge Outline', '1 to 1/ webinar/Event Outline'],
    },
    {
      stepNumber: 3, name: 'Brand Setup', owningTeamName: 'Design Team', slaDays: 7,
      columns: ['Ad Account Access', 'Photos'],
    },
    {
      stepNumber: 4, name: 'Funnel Build', owningTeamName: 'Tech Team', slaDays: 10,
      columns: ['LP Content', 'LP Design'],
    },
    {
      stepNumber: 5, name: 'Ad Creative', owningTeamName: 'Creative Team', slaDays: 7,
      columns: ['Ad Creative Scripts', 'Ad Creatives', 'Ad Videos Scripts', 'Client Videos', 'AdAssist', 'adassist', 'Ad Assist'],
    },
    {
      stepNumber: 6, name: 'Automation Setup', owningTeamName: 'Automation Team', slaDays: 5,
      columns: ['WA Templates', 'Automation'],
    },
    {
      stepNumber: 7, name: 'Ad Launch', owningTeamName: 'Media Buyer', slaDays: 5,
      columns: ['Ads Launch'],
    },
    {
      stepNumber: 8, name: 'Funnel Launch', owningTeamName: 'Intake Team', slaDays: 3,
      columns: ['Funnel Launched'],
    },
    {
      stepNumber: 9, name: 'WON', owningTeamName: 'Sales Team', slaDays: 1,
      columns: ['WON'],
    },
  ] as const;

  // ─── Column-level status resolver ────────────────────────────────────────
  // Derived by scanning ALL 70 rows of the Excel — every distinct value observed
  // is handled explicitly below.
  function resolveTaskStatus(colName: string, rawVal: any): {
    status: 'pending' | 'in_progress' | 'complete' | 'blocked';
    description: string | null;
    isComplete: boolean;
  } {
    const val = rawVal != null ? String(rawVal).trim() : '';
    const lower = val.toLowerCase();

    // ── Empty / not started ──────────────────────────────────────────────
    if (!val || val === '-' || lower === 'pending') {
      return { status: 'pending', description: null, isComplete: false };
    }

    // ── "Funnel Launched" column ──────────────────────────────────────────
    // Values in this column are FUNNEL TYPES (One to One, 3-Day, Hybrid Webinar, etc.)
    // — any non-empty value means the funnel IS launched → complete with funnel type as note.
    if (colName === 'Funnel Launched') {
      return { status: 'complete', description: val, isComplete: true };
    }

    // ── "WON" column — explicit closed/not-closed mapping ─────────────────
    // Observed values: 'Closed - HT', 'One to One', 'Yes' → closed
    //                  'No Closing yet', 'No Result' → not closed
    if (colName === 'WON') {
      const isClosed =
        lower.startsWith('closed') ||
        lower === 'yes' ||
        lower === 'one to one' ||
        lower.includes('won');
      if (isClosed) {
        return { status: 'complete', description: val, isComplete: true };
      }
      // 'No Closing yet', 'No Result'
      return { status: 'pending', description: val, isComplete: false };
    }

    // ── Generic: "Done…" variants (case-insensitive, with optional notes) ──
    // Covers: 'Done', 'Done (Sourabh)', 'Done ( Testimonial remaining...)',
    //         'Done(Professional photos...)', 'DONE', 'Amost Done'
    if (lower.includes('done') || lower === 'amost done' || lower.includes('complete') || lower === 'yes') {
      // Keep extra notes as description (e.g. "Done (Sourabh)")
      const note = val.toLowerCase() !== 'done' ? val : null;
      return { status: 'complete', description: note, isComplete: true };
    }

    // ── Blocked states ─────────────────────────────────────────────────────
    // Covers: 'Paused', 'Ad scripts Pending', 'Images Pending',
    //         'Telugu Videos - Pending', 'No Show - 3 times'
    if (
      lower === 'paused' ||
      (lower.includes('pending') && lower !== 'pending') ||
      lower.includes('no show')
    ) {
      return { status: 'blocked', description: val, isComplete: false };
    }

    // ── In-progress states ─────────────────────────────────────────────────
    // Covers: 'WIP', 'WIP (usne bola h testimonial degi)', 'In review',
    //         'In review ', 'Review', 'Not Started'
    if (
      lower.startsWith('wip') ||
      lower.includes('in review') ||
      lower === 'review' ||
      lower === 'not started'
    ) {
      return { status: 'in_progress', description: val, isComplete: false };
    }

    // ── Fallback: has a value we don't recognise — treat as in_progress ────
    return { status: 'in_progress', description: val, isComplete: false };
  }

  // ─── Transaction ─────────────────────────────────────────────────────────
  return await prisma.$transaction(async (tx) => {
    // Temp placeholder step (needed for FK on client.currentStepId)
    const firstStep = await tx.step.findFirst({ where: { organisationId } });
    if (!firstStep) throw new Error('System steps not seeded. Please run database setup first.');

    // Find if the client already exists (by name or by any of their aliases)
    let client = await tx.client.findFirst({
      where: {
        organisationId,
        fullName: {
          equals: clientData.fullName,
          mode: 'insensitive',
        },
      },
    });

    if (!client && clientData.aliases && clientData.aliases.length > 0) {
      client = await tx.client.findFirst({
        where: {
          organisationId,
          fullName: {
            in: clientData.aliases,
            mode: 'insensitive',
          },
        },
      });
    }

    if (client) {
      // Update existing client record
      client = await tx.client.update({
        where: { id: client.id },
        data: {
          email: clientData.email || client.email,
          whatsappNumber: clientData.whatsappNumber || client.whatsappNumber,
          dateJoined: clientData.dateJoined || client.dateJoined,
          currentStepId: firstStep.id,
          notes: clientData.notes 
            ? `${client.notes ? client.notes + ' \n ' : ''}${clientData.notes} [Imported via CSV/Excel]` 
            : client.notes,
        },
      });

      // Clear existing pipeline steps and tasks for a clean import overwrite
      await tx.stepHistory.deleteMany({ where: { clientId: client.id } });
      await tx.task.deleteMany({ where: { clientId: client.id } });
      await tx.stepTaskTemplate.deleteMany({
        where: {
          step: {
            clientId: client.id,
          },
        },
      });
      await tx.step.deleteMany({ where: { clientId: client.id } });
    } else {
      // Create client record
      client = await tx.client.create({
        data: {
          organisationId,
          fullName: clientData.fullName,
          email: clientData.email || null,
          whatsappNumber: clientData.whatsappNumber || null,
          currentStepId: firstStep.id, // updated at the end
          stepEnteredAt: new Date(),
          dateJoined: clientData.dateJoined || new Date(),
          createdById: adminUserId,
          status: 'active',
          notes: clientData.notes ? `${clientData.notes} [Imported via CSV/Excel]` : 'Imported via CSV/Excel',
        },
      });
    }

    // Pre-fetch all active users for this organisation to avoid DB query inside loop
    const allUsers = await tx.user.findMany({
      where: { organisationId, isActive: true },
    });

    // Cache team → assignee lookup
    const teamAssigneeCache: Record<string, string> = {};
    const getAssignee = (teamName: string): string => {
      if (teamAssigneeCache[teamName]) return teamAssigneeCache[teamName];
      const members = allUsers.filter((u) => u.teamName === teamName);
      members.sort((a, b) => a.role.localeCompare(b.role)); // team_leader sorts alphabetically first
      const leader = members.find((m) => m.role === 'team_leader');
      const assigneeId = leader?.id || members[0]?.id || adminUserId;
      teamAssigneeCache[teamName] = assigneeId;
      return assigneeId;
    };

    const createdSteps: { id: string; stepNumber: number }[] = [];
    let firstIncompleteStepNumber = 999; // track earliest step with any incomplete task

    const tasksToCreate: any[] = [];
    const templatesToCreate: any[] = [];

    for (const s of PIPELINE_MAPPING) {
      // Create the client-specific step
      const dbStep = await tx.step.create({
        data: {
          organisationId,
          clientId: client.id,
          stepNumber: s.stepNumber,
          name: s.name,
          owningTeamName: s.owningTeamName,
          slaDays: s.slaDays,
          isActive: true,
        },
      });
      createdSteps.push({ id: dbStep.id, stepNumber: s.stepNumber });

      const assigneeId = getAssignee(s.owningTeamName);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + s.slaDays);

      let stepHasIncompleteTask = false;

      // Case-insensitive key lookup helper for Excel row values
      const getValueCaseInsensitive = (keyToFind: string, obj: Record<string, any>) => {
        const target = keyToFind.trim().toLowerCase();
        const foundKey = Object.keys(obj).find(k => k.trim().toLowerCase() === target);
        return foundKey ? obj[foundKey] : undefined;
      };

      const rowKeys = Object.keys(taskStatuses).map(k => k.trim().toLowerCase());
      const activeColumns = s.columns.filter(colName => 
        rowKeys.includes(colName.trim().toLowerCase())
      );

      for (let i = 0; i < activeColumns.length; i++) {
        const colName = activeColumns[i];
        const rawVal = getValueCaseInsensitive(colName, taskStatuses);
        const { status, description, isComplete } = resolveTaskStatus(colName, rawVal);

        if (!isComplete) stepHasIncompleteTask = true;

        tasksToCreate.push({
          organisationId,
          clientId: client.id,
          stepId: dbStep.id,
          assignedToId: assigneeId,
          title: colName,
          description,
          priority: 'normal',
          dueDate,
          status,
          completedAt: isComplete ? new Date() : null,
          completedById: isComplete ? adminUserId : null,
        });

        templatesToCreate.push({
          stepId: dbStep.id,
          organisationId,
          title: colName,
          relativeDueDay: s.slaDays,
          sortOrder: i + 1,
          priority: 'normal',
        });
      }

      // Record earliest incomplete step as the client's current position
      // If the step has no active columns/tasks, it is considered complete.
      if (activeColumns.length > 0 && stepHasIncompleteTask && s.stepNumber < firstIncompleteStepNumber) {
        firstIncompleteStepNumber = s.stepNumber;
      }
    }

    if (tasksToCreate.length > 0) {
      await tx.task.createMany({ data: tasksToCreate });
    }
    if (templatesToCreate.length > 0) {
      await tx.stepTaskTemplate.createMany({ data: templatesToCreate });
    }

    // ── Determine final current step & client status ─────────────────────
    let finalStepId: string;
    let finalClientStatus: 'active' | 'completed';

    if (firstIncompleteStepNumber === 999) {
      // All tasks across all steps are complete → client is WON/completed
      const wonStep = createdSteps.find((st) => st.stepNumber === 9);
      finalStepId = wonStep?.id ?? createdSteps[createdSteps.length - 1].id;
      finalClientStatus = 'completed';
    } else {
      const currStep = createdSteps.find((st) => st.stepNumber === firstIncompleteStepNumber);
      finalStepId = currStep?.id ?? createdSteps[0].id;
      finalClientStatus = 'active';
    }

    // Update client with the real current step
    const updatedClient = await tx.client.update({
      where: { id: client.id },
      data: { currentStepId: finalStepId, status: finalClientStatus },
    });

    // Audit trail
    await tx.stepHistory.create({
      data: {
        organisationId,
        clientId: client.id,
        toStepId: finalStepId,
        triggeredBy: 'admin',
        triggeredByUserId: adminUserId,
        reasonNote: 'Imported from Excel',
      },
    });

    return updatedClient;
  }, { timeout: 30000 }); // 30s timeout for large imports
}

