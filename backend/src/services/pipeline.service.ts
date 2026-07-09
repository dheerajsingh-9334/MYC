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
