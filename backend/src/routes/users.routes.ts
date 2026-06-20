import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

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
        _count: { select: { assignedTasks: { where: { status: { in: ['pending', 'in_progress'] } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
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

export default router;
