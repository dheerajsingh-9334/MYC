import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// GET /api/notifications
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.userId, organisationId: req.user.orgId },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', requireAuth, async (req: Request, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user.userId, organisationId: req.user.orgId, isRead: false },
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', requireAuth, async (req: Request, res: Response) => {
  try {
    const updated = await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
