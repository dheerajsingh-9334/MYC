import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole, requireAdminOrLeader } from '../middleware/auth.middleware';
import { checkAutoAdvancement } from '../services/pipeline.service';
import {
  notifyBlockerRaised,
  notifyExtensionRequested,
  notifyExtensionDecision,
  notifyTaskAssigned,
  notifyTaskCompleted,
} from '../services/notify.service';

const router = Router();

// POST /api/tasks — admin or team_leader creates an ad-hoc task on a client
// Body: { clientId, stepId?, title, description?, priority?, dueDate, assignedToId }
router.post('/', requireAuth, requireAdminOrLeader, async (req: Request, res: Response) => {
  try {
    const { clientId, stepId, title, description, priority, dueDate, assignedToId } = req.body;
    if (!clientId || !title || !dueDate || !assignedToId) {
      res.status(400).json({ error: 'clientId, title, dueDate, assignedToId required' });
      return;
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, organisationId: req.user.orgId },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, organisationId: req.user.orgId, isActive: true },
    });
    if (!assignee) { res.status(404).json({ error: 'Assignee not found' }); return; }

    // Default the step to client's current step if not provided
    const finalStepId = stepId || client.currentStepId;
    const step = await prisma.step.findFirst({
      where: { id: finalStepId, organisationId: req.user.orgId },
    });
    if (!step) { res.status(404).json({ error: 'Step not found' }); return; }

    const task = await prisma.task.create({
      data: {
        organisationId: req.user.orgId,
        clientId,
        stepId: finalStepId,
        assignedToId,
        title,
        description: description || null,
        priority: priority === 'high' ? 'high' : 'normal',
        dueDate: new Date(dueDate),
        status: 'pending',
      },
      include: {
        client: { select: { brandName: true, fullName: true } },
        step: { select: { name: true, owningTeamName: true } },
      },
    });

    // Notify the assignee
    await notifyTaskAssigned({
      organisationId: req.user.orgId,
      assigneeId: assignedToId,
      taskTitle: title,
      clientName: task.client.brandName || task.client.fullName,
      taskId: task.id,
    });

    res.status(201).json(task);
  } catch (err) {
    console.error('[tasks] POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;
    const where: any = { organisationId: orgId };

    if (role === 'team_leader' && teamName) {
      // Team leader: see all tasks assigned to members of their team
      const teamMemberIds = await prisma.user
        .findMany({ where: { organisationId: orgId, teamName, isActive: true }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));
      where.assignedToId = { in: teamMemberIds };
    } else if (role === 'team_member') {
      where.assignedToId = userId;
    }
    // admin: all tasks

    const tasks = await prisma.task.findMany({
      where,
      include: {
        client: true,
        step: true,
        assignedTo: { select: { id: true, fullName: true, email: true, teamName: true } },
        completedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: true,
        step: true,
        assignedTo: { select: { id: true, fullName: true, teamName: true } },
      },
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.json(task);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/complete
router.patch('/:id/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: { select: { id: true, brandName: true, fullName: true } },
        step: { select: { id: true, name: true, owningTeamName: true } },
      },
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const completedAt = new Date();
    const onTime = completedAt <= new Date(task.dueDate);

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'complete',
        completedAt,
        completedById: req.user.userId,
      },
    });

    // Fire-and-forget admin/lead notification. We don't want to slow the
    // user-facing PATCH if the notification write fails — log and move on.
    const actor = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { fullName: true },
    });
    notifyTaskCompleted({
      organisationId: req.user.orgId,
      taskTitle: task.title,
      clientName: task.client?.brandName || task.client?.fullName || 'client',
      stepName: task.step.name,
      stepId: task.step.id,
      owningTeamName: task.step.owningTeamName,
      completedById: req.user.userId,
      completedByName: actor?.fullName || 'A team member',
      taskId: task.id,
      clientId: task.client.id,
      onTime,
    }).catch((err) => {
      console.error('[notifyTaskCompleted] failed:', err);
    });

    // Check if all tasks in this step are done → auto-advance + notifies new team
    const advancement = await checkAutoAdvancement(task.clientId, task.stepId);

    res.json({ task: updated, advancement });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/blocker
router.patch('/:id/blocker', requireAuth, async (req: Request, res: Response) => {
  try {
    const { blockerNote } = req.body;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: true,
        step: true,
        assignedTo: { select: { fullName: true } },
      },
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: { status: 'blocked', blockerNote },
    });

    // ── NOTIFY: admins + whole step team ─────────────────────────────
    const raisedByName = task.assignedTo?.fullName || 'Team Member';
    await notifyBlockerRaised({
      organisationId: req.user.orgId,
      taskTitle: task.title,
      clientName: task.client.brandName || task.client.fullName,
      blockerNote,
      teamName: task.step.owningTeamName,
      raisedByName,
      taskId: task.id,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/extension
router.patch('/:id/extension', requireAuth, async (req: Request, res: Response) => {
  try {
    const { extensionRequestedDate, extensionReason } = req.body;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: true,
        assignedTo: { select: { fullName: true } },
      },
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: 'extension_requested',
        extensionRequestedDate: new Date(extensionRequestedDate),
        extensionReason,
      },
    });

    // ── NOTIFY: admins only ───────────────────────────────────────────
    await notifyExtensionRequested({
      organisationId: req.user.orgId,
      taskTitle: task.title,
      clientName: task.client.brandName || task.client.fullName,
      extensionReason,
      requestedBy: task.assignedTo?.fullName || 'Team Member',
      taskId: task.id,
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tasks/:id/approve-extension (admin only)
router.patch('/:id/approve-extension', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { approved } = req.body;
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        client: true,
        assignedTo: { select: { id: true, fullName: true } },
      },
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const newDue = approved && task.extensionRequestedDate ? task.extensionRequestedDate : task.dueDate;

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        status: approved ? 'in_progress' : 'pending',
        dueDate: newDue,
      },
    });

    // ── NOTIFY: tell the assignee the outcome ─────────────────────────
    if (task.assignedTo) {
      await notifyExtensionDecision({
        organisationId: req.user.orgId,
        taskTitle: task.title,
        clientName: task.client.brandName || task.client.fullName,
        approved,
        assigneeId: task.assignedTo.id,
        newDueDate: newDue?.toLocaleDateString('en-IN'),
        taskId: task.id,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
