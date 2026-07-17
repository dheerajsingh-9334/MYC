import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// GET /api/problems - List problems based on role
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, userId } = req.user;
    
    let where: any = { organisationId: orgId };
    
    // For team leaders, "team leader called all problem" - they see all problems in the org.
    // For admin, they also see all problems in the org.
    // For team members, they see problems they raised.
    if (role === 'team_member') {
      where.userId = userId;
    }
    
    const problems = await prisma.problem.findMany({
      where,
      include: {
        client: {
          select: { id: true, fullName: true, brandName: true }
        },
        user: {
          select: { id: true, fullName: true, role: true, teamName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(problems);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/problems - Raise a hand/problem
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { orgId, userId, role } = req.user;
    if (role === 'admin') {
      res.status(403).json({ error: 'Admins cannot raise problems' });
      return;
    }
    const { clientId, title, description } = req.body;
    
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }
    
    const problem = await prisma.problem.create({
      data: {
        organisationId: orgId,
        userId,
        clientId: clientId || undefined,
        title,
        description,
      },
      include: {
        client: {
          select: { id: true, fullName: true, brandName: true }
        },
        user: {
          select: { id: true, fullName: true, role: true, teamName: true }
        }
      }
    });
    
    // Create notifications for all admins
    try {
      const admins = await prisma.user.findMany({
        where: { organisationId: orgId, role: 'admin', isActive: true },
        select: { id: true }
      });
      
      const clientName = problem.client ? (problem.client.brandName || problem.client.fullName) : 'General';
      const notificationMsg = `✋ Hand raised by ${problem.user.fullName} (${problem.user.role === 'team_leader' ? 'Team Lead' : 'Teammate'}) regarding ${clientName}: "${title}"`;
      
      const payloads = admins.map((admin) => ({
        organisationId: orgId,
        userId: admin.id,
        type: 'notif_alert',
        message: notificationMsg,
        referenceId: problem.id,
        referenceType: 'problem',
      }));
      
      if (payloads.length > 0) {
        await prisma.notification.createMany({ data: payloads as any });
      }
    } catch (notifErr) {
      console.error('[problems notification failed]:', notifErr);
    }
    
    res.status(201).json(problem);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/problems/:id/resolve - Resolve a problem
router.patch('/:id/resolve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { orgId, role, userId } = req.user;
    
    // Check if problem exists in this org
    const problem = await prisma.problem.findFirst({
      where: { id: req.params.id, organisationId: orgId }
    });
    
    if (!problem) {
      res.status(404).json({ error: 'Problem not found' });
      return;
    }
    
    // Only admins or the user who raised the problem (or team leaders) can resolve it
    if (role !== 'admin' && role !== 'team_leader' && problem.userId !== userId) {
      res.status(403).json({ error: 'Access denied: cannot resolve this problem' });
      return;
    }
    
    const updated = await prisma.problem.update({
      where: { id: req.params.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date()
      },
      include: {
        client: {
          select: { id: true, fullName: true, brandName: true }
        },
        user: {
          select: { id: true, fullName: true }
        }
      }
    });
    
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
