import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { sendPushNotificationEmail } from '../services/email.service';

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
    const notif = await prisma.notification.update({
      where: { id: req.params.id, userId: req.user.userId },
      data: { isRead: true },
    });
    res.json(notif);
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

// DELETE /api/notifications/clear-all
router.delete('/clear-all', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.notification.deleteMany({
      where: { userId: req.user.userId, organisationId: req.user.orgId },
    });
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/notifications/admin-push — ADMIN ONLY to push notifications
router.post('/admin-push', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { message, target, userId, teamName } = req.body;
    if (!message || !message.trim()) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }
    if (!target || !['all', 'user', 'team'].includes(target)) {
      res.status(400).json({ error: 'Target must be one of: all, user, team' });
      return;
    }

    const orgId = req.user.orgId;
    let recipients: { id: string; email: string; fullName: string }[] = [];

    if (target === 'user') {
      if (!userId) {
        res.status(400).json({ error: 'userId is required for user target' });
        return;
      }
      const targetUser = await prisma.user.findUnique({
        where: { id: userId, organisationId: orgId, isActive: true },
        select: { id: true, email: true, fullName: true }
      });
      if (!targetUser) {
        res.status(404).json({ error: 'Target user not found or inactive' });
        return;
      }
      recipients = [targetUser];
    } else if (target === 'team') {
      if (!teamName) {
        res.status(400).json({ error: 'teamName is required for team target' });
        return;
      }
      const teamUsers = await prisma.user.findMany({
        where: { organisationId: orgId, teamName: teamName, isActive: true },
        select: { id: true, email: true, fullName: true }
      });
      if (teamUsers.length === 0) {
        res.status(404).json({ error: 'No active users found in the specified team' });
        return;
      }
      recipients = teamUsers;
    } else {
      // Broadcast to all active users in the organisation
      const allUsers = await prisma.user.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { id: true, email: true, fullName: true }
      });
      recipients = allUsers;
    }

    if (recipients.length === 0) {
      res.status(400).json({ error: 'No active recipients found' });
      return;
    }

    // Create notifications for all recipients
    const payloads = recipients.map(u => ({
      organisationId: orgId,
      userId: u.id,
      type: 'admin_broadcast' as any,
      message: message.trim(),
    }));

    await prisma.notification.createMany({
      data: payloads
    });

    // Send push notification email to each recipient asynchronously
    recipients.forEach((u) => {
      sendPushNotificationEmail(u.email, u.fullName, message.trim()).catch((err) => {
        console.error(`Error sending push notification email to ${u.email}:`, err);
      });
    });

    res.status(201).json({
      message: `Notification pushed successfully to ${recipients.length} user(s).`,
      recipientCount: recipients.length
    });
  } catch (err) {
    console.error('[notifications.admin-push] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
