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
  // On auto-advance (triggered by task completion) we fire-and-forget so the
  // PATCH /api/tasks/:id/complete response returns in <100ms. On manual move
  // (admin moves a client) we await so the admin sees notification creation
  // complete before the response — that path is rare and not on a hot loop.
  const stepNotifPromise = notifyStepAdvanced({
    organisationId: client.organisationId,
    clientName,
    stepNumber: toStep.stepNumber,
    stepName: toStep.name,
    owningTeamName: toStep.owningTeamName,
    triggeredBy,
    triggeredByName,
    clientId,
  });
  if (triggeredBy === 'system') {
    void stepNotifPromise.catch((err) => console.error('[auto-advance] notification broadcast failed:', err));
  } else {
    await stepNotifPromise;
  }

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

  for (let i = 0; i < toStep.taskTemplates.length; i++) {
    const template = toStep.taskTemplates[i];
    // Pick least loaded member
    taskCounts.sort((a, b) => a.count - b.count);
    const assignee = taskCounts[i % taskCounts.length].member;
    taskCounts[i % taskCounts.length].count++;

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
    const taskNotif = notifyTaskAssigned({
      organisationId: client.organisationId,
      assigneeId: assignee.id,
      taskTitle: template.title,
      clientName,
      taskId: task.id,
    });
    if (triggeredBy === 'system') {
      void taskNotif.catch((err) => console.error('[auto-advance] task-assigned notification failed:', err));
    } else {
      await taskNotif;
    }
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
