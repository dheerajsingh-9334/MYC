import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { computeClientStatus } from '../services/pipeline.service';

const router = Router();

// GET /api/standup
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const isLeader = req.user.role === 'team_leader';
    const leaderTeam = req.user.teamName;

    // Get all active, pinned, or tasks-pinned clients with their tasks
    const clients = await prisma.client.findMany({
      where: {
        organisationId: req.user.orgId,
        OR: [
          { status: 'active' },
          { isPinned: true },
          {
            tasks: {
              some: {
                status: { notIn: ['complete', 'cancelled'] },
                OR: [
                  { isPinned: true },
                  { isAlerted: true }
                ]
              }
            }
          }
        ]
      },
      include: {
        currentStep: true,
        tasks: {
          where: {
            status: { notIn: ['complete', 'cancelled'] },
            ...(isLeader && leaderTeam ? {
              OR: [
                { assignedTo: { teamName: leaderTeam } },
                { step: { owningTeamName: leaderTeam } }
              ]
            } : {})
          },
          include: {
            assignedTo: { select: { fullName: true, teamName: true } },
            step: true,
          },
        },
      },
    });

    const alertItems = [];
    for (const client of clients) {
      const status = computeClientStatus(client.tasks);
      const hasPinnedOrAlerted = client.isPinned || client.tasks.some(t => t.isPinned || t.isAlerted);
      if (status === 'on_track' && !hasPinnedOrAlerted) continue;

      for (const task of client.tasks) {
        const taskStatus = task.status;
        let alertType: string | null = null;
        let daysLate = 0;

        if (taskStatus === 'blocked') {
          alertType = 'blocked';
        } else if (new Date(task.dueDate) < today) {
          alertType = 'overdue';
          daysLate = Math.floor((today.getTime() - new Date(task.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        } else {
          const due = new Date(task.dueDate);
          if (due >= today && due < tomorrow) {
            alertType = 'due_today';
          } else if (task.isAlerted || task.isPinned || client.isPinned) {
            alertType = 'highlighted';
          }
        }

        if (alertType) {
          alertItems.push({
            client: { id: client.id, fullName: client.fullName, brandName: client.brandName, isPinned: client.isPinned },
            step: client.currentStep,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate,
              createdAt: task.createdAt,
              blockerNote: task.blockerNote,
              assignedTo: task.assignedTo,
              isPinned: task.isPinned,
              isAlerted: task.isAlerted,
            },
            alertType,
            daysLate,
          });
        }
      }
    }

    res.json({
      date: new Date().toISOString(),
      total: alertItems.length,
      items: alertItems,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (_req: Request, res: Response) => {
  // handled in dashboard route
  res.json({});
});

// POST /api/standup/highlight
router.post('/highlight', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;
    if (!taskId) { res.status(400).json({ error: 'taskId required' }); return; }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignedTo: true, client: true }
    });
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

    const member = task.assignedTo;
    if (!member) { res.status(400).json({ error: 'Task is not assigned to anyone' }); return; }

    // Find the team leader
    let leader = null;
    if (member.teamName) {
      leader = await prisma.user.findFirst({
        where: { organisationId: req.user.orgId, teamName: member.teamName, role: 'team_leader' }
      });
    }

    const shouldAlert = !task.isAlerted;

    if (shouldAlert) {
      await prisma.task.update({
        where: { id: taskId },
        data: { isPinned: true, isAlerted: true }
      });
      await prisma.client.update({
        where: { id: task.clientId },
        data: { isPinned: true }
      });

      const { sendHighlightEmail } = await import('../services/email.service');
      
      // Send email to member
      if (member.email) {
        await sendHighlightEmail(member.email, member.fullName, task.title, task.client.brandName || task.client.fullName, 'member');
      }
      // Send email to leader
      if (leader && leader.email) {
        await sendHighlightEmail(leader.email, leader.fullName, task.title, task.client.brandName || task.client.fullName, 'leader');
      }

      // Create broadcast notification
      await prisma.notification.create({
        data: {
          organisationId: req.user.orgId,
          userId: req.user.userId, // We'll just assign it to the admin who triggered it, or broadcast it globally
          type: 'highlight_broadcast',
          message: `Task Highlighted: ${task.title} for ${task.client.brandName || task.client.fullName}`,
          referenceId: task.id,
          referenceType: 'task',
        }
      });
    } else {
      await prisma.task.update({
        where: { id: taskId },
        data: { isPinned: false, isAlerted: false }
      });

      // Check if client has other pinned or alerted tasks
      const otherPinnedOrAlerted = await prisma.task.findFirst({
        where: {
          clientId: task.clientId,
          id: { not: taskId },
          OR: [
            { isPinned: true },
            { isAlerted: true }
          ]
        }
      });
      if (!otherPinnedOrAlerted) {
        await prisma.client.update({
          where: { id: task.clientId },
          data: { isPinned: false }
        });
      }
    }

    res.json({ success: true, isAlerted: shouldAlert });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
