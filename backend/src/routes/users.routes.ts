import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { uploadToCloudinary } from '../services/cloudinary.service';
import { sendPasswordChangedEmail } from '../services/email.service';
import { validatePhone } from '../utils/validation';


const router = Router();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
});

// POST /api/users/upload-avatar — Upload user avatar to Cloudinary
router.post('/upload-avatar', requireAuth, upload.single('avatar'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }
    const secureUrl = await uploadToCloudinary(req.file.buffer, 'avatars');
    res.json({ url: secureUrl });
  } catch (err: any) {
    console.error('[users.upload-avatar] error:', err);
    res.status(500).json({ error: err.message || 'Failed to upload avatar' });
  }
});

// GET /api/users/me — Get logged-in user profile & stats
router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        teamName: true,
        whatsappNumber: true,
        isActive: true,
        createdAt: true,
        avatarUrl: true,
      }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get user stats
    const tasks = await prisma.task.findMany({
      where: { assignedToId: userId },
      select: {
        status: true,
        dueDate: true,
        completedAt: true,
      }
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'complete').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;

    // On-time completion rate: completed on or before due date
    const completedTasksList = tasks.filter(t => t.status === 'complete' && t.completedAt);
    const onTimeTasksCount = completedTasksList.filter(t => new Date(t.completedAt!) <= new Date(t.dueDate)).length;
    const onTimeRate = completedTasksList.length > 0
      ? Math.round((onTimeTasksCount / completedTasksList.length) * 100)
      : 100;

    res.json({
      ...user,
      performance: {
        totalTasks,
        completedTasks,
        pendingTasks,
        onTimeRate,
      }
    });
  } catch (err) {
    console.error('[users.me] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/me — Update logged-in user profile/password
router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.userId;
    const { fullName, whatsappNumber, password, avatarUrl } = req.body;

    if (whatsappNumber && !validatePhone(whatsappNumber)) {
      res.status(400).json({ error: 'Invalid WhatsApp number format. Must be 7-15 digits.' });
      return;
    }


    const updateData: any = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (whatsappNumber !== undefined) updateData.whatsappNumber = whatsappNumber || null;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl || null;
    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        teamName: true,
        whatsappNumber: true,
        isActive: true,
        createdAt: true,
        avatarUrl: true,
      }
    });

    if (password) {
      sendPasswordChangedEmail(updated.email, updated.fullName).catch((err) => {
        console.error(`Error sending password changed email to ${updated.email}:`, err);
      });
    }

    res.json(updated);
  } catch (err) {
    console.error('[users.me.update] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users
// - admin: sees all users in the org
// - team_leader: sees only members of their own team
// - team_member: forbidden
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName } = req.user;

    if (role !== 'admin' && role !== 'team_leader') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const where: any = { organisationId: orgId };
    if (role === 'team_leader' && teamName) {
      where.teamName = teamName;
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, fullName: true, role: true,
        teamName: true, isActive: true, createdAt: true, lastLoginAt: true,
        avatarUrl: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const userIds = users.map((u) => u.id);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const tasks = await prisma.task.findMany({
      where: {
        organisationId: orgId,
        assignedToId: { in: userIds },
      },
      select: {
        id: true,
        status: true,
        dueDate: true,
        completedAt: true,
        assignedToId: true,
        createdAt: true,
      },
    });

    const usersWithStats = users.map((u) => {
      const userTasks = tasks.filter((t) => t.assignedToId === u.id);
      const active = userTasks.filter((t) => t.status !== 'complete' && t.status !== 'cancelled').length;
      const overdue = userTasks.filter(
        (t) => (t.status !== 'complete' && t.status !== 'cancelled') && new Date(t.dueDate) < today
      ).length;
      const completedLast7d = userTasks.filter(
        (t) => t.status === 'complete' && t.completedAt && new Date(t.completedAt) >= sevenDaysAgo
      ).length;

      const completedTasks = userTasks.filter((t) => t.status === 'complete' && t.createdAt && t.completedAt);
      let avgCompletionTimeStr = '—';
      if (completedTasks.length > 0) {
        let totalMs = 0;
        for (const t of completedTasks) {
          totalMs += new Date(t.completedAt!).getTime() - new Date(t.createdAt!).getTime();
        }
        const avgMs = totalMs / completedTasks.length;
        const avgDays = avgMs / (1000 * 60 * 60 * 24);
        if (avgDays >= 1) {
          avgCompletionTimeStr = `${avgDays.toFixed(1)}d`;
        } else {
          const avgHours = avgMs / (1000 * 60 * 60);
          if (avgHours >= 1) {
            avgCompletionTimeStr = `${avgHours.toFixed(1)}h`;
          } else {
            const avgMins = avgMs / (1000 * 60);
            avgCompletionTimeStr = `${Math.round(avgMins)}m`;
          }
        }
      }

      return {
        ...u,
        active,
        overdue,
        completedLast7d,
        avgCompletionTime: avgCompletionTimeStr,
        _count: {
          assignedTasks: active,
        },
      };
    });

    res.json(usersWithStats);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — ADMIN ONLY
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { email, fullName, role, teamName, whatsappNumber } = req.body;
    if (!email || !fullName || !role) {
      res.status(400).json({ error: 'email, fullName, role required' });
      return;
    }

    const validRoles = ['admin', 'team_leader', 'team_member'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    const passwordHash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.create({
      data: {
        organisationId: req.user.orgId,
        email,
        passwordHash,
        fullName,
        role,
        teamName,
        whatsappNumber,
        isActive: true,
      },
    });
    res.status(201).json({
      id: user.id, email: user.email, fullName: user.fullName,
      role: user.role, teamName: user.teamName,
    });
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Email already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// PATCH /api/users/:id — ADMIN ONLY
router.patch('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { fullName, role, teamName, whatsappNumber } = req.body;
    if (whatsappNumber && !validatePhone(whatsappNumber)) {
      res.status(400).json({ error: 'Invalid WhatsApp number format. Must be 7-15 digits.' });
      return;
    }

    if (role !== undefined) {
      const validRoles = ['admin', 'team_leader', 'team_member'];
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
        return;
      }
    }
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { fullName, role, teamName, whatsappNumber },
    });
    res.json({ id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role, teamName: updated.teamName });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/deactivate — ADMIN ONLY
router.patch('/:id/deactivate', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ id: updated.id, isActive: updated.isActive });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id/activate — ADMIN ONLY
router.patch('/:id/activate', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });
    res.json({ id: updated.id, isActive: updated.isActive });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — ADMIN ONLY
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    await prisma.$transaction(async (tx) => {
      const userTasks = await tx.task.findMany({
        where: { assignedToId: req.params.id },
        select: { id: true },
      });
      const taskIds = userTasks.map((t) => t.id);

      if (taskIds.length > 0) {
        await tx.document.deleteMany({
          where: { taskId: { in: taskIds } },
        });
      }

      await tx.task.deleteMany({
        where: { assignedToId: req.params.id },
      });

      await tx.task.updateMany({
        where: { completedById: req.params.id },
        data: { completedById: null },
      });
      await tx.task.updateMany({
        where: { rejectedById: req.params.id },
        data: { rejectedById: null },
      });
      await tx.stepHistory.updateMany({
        where: { triggeredByUserId: req.params.id },
        data: { triggeredByUserId: null },
      });

      await tx.notification.deleteMany({
        where: { userId: req.params.id },
      });

      await tx.user.delete({
        where: { id: req.params.id },
      });
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[users] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
