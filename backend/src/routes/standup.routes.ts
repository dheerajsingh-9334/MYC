import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { computeClientStatus } from '../services/pipeline.service';

const router = Router();

// GET /api/standup
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all active clients with their tasks
    const clients = await prisma.client.findMany({
      where: { organisationId: req.user.orgId, status: 'active' },
      include: {
        currentStep: true,
        tasks: {
          where: { status: { notIn: ['complete', 'cancelled'] } },
          include: { assignedTo: { select: { fullName: true, teamName: true } } },
        },
      },
    });

    const alertItems = [];
    for (const client of clients) {
      const status = computeClientStatus(client.tasks);
      if (status === 'on_track') continue;

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
          }
        }

        if (alertType) {
          alertItems.push({
            client: { id: client.id, fullName: client.fullName, brandName: client.brandName },
            step: client.currentStep,
            task: {
              id: task.id,
              title: task.title,
              status: task.status,
              dueDate: task.dueDate,
              blockerNote: task.blockerNote,
              assignedTo: task.assignedTo,
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

export default router;
