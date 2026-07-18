import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import bcrypt from 'bcryptjs';
import { sendInvitationEmail } from '../services/email.service';

const router = Router();

// GET /api/teams
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user.orgId;
    const role = req.user.role;
    const userTeam = req.user.teamName;

    if (role === 'admin') {
      // Fetch teams from Team table
      let dbTeams = await prisma.team.findMany({
        where: { organisationId: orgId },
        select: { name: true }
      });

      // Seed default teams if no teams exist in the Team table for this org
      if (dbTeams.length === 0) {
        const defaultTeams = [
          'Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 
          'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 
          'Account Manager', 'Content Team'
        ];
        await prisma.team.createMany({
          data: defaultTeams.map(name => ({
            organisationId: orgId,
            name
          })),
          skipDuplicates: true
        });

        dbTeams = await prisma.team.findMany({
          where: { organisationId: orgId },
          select: { name: true }
        });
      }

      // Fetch unique teamNames from User
      const userTeams = await prisma.user.findMany({
        where: { organisationId: orgId },
        select: { teamName: true },
        distinct: ['teamName']
      });

      // Fetch unique owningTeamName from Step
      const stepTeams = await prisma.step.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { owningTeamName: true },
        distinct: ['owningTeamName']
      });

      const teamNamesSet = new Set<string>();
      
      dbTeams.forEach(t => t.name && teamNamesSet.add(t.name.trim()));
      userTeams.forEach(u => u.teamName && teamNamesSet.add(u.teamName.trim()));
      stepTeams.forEach(s => s.owningTeamName && teamNamesSet.add(s.owningTeamName.trim()));

      const teams = Array.from(teamNamesSet).sort();
      res.json(teams);
    } else {
      // Non-admins only see their own team
      if (userTeam) {
        res.json([userTeam]);
      } else {
        res.json([]);
      }
    }
  } catch (err) {
    console.error('[teams] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    const orgId = req.user.orgId;
    const cleanName = name.trim();

    // Check if team already exists in db
    const existing = await prisma.team.findFirst({
      where: { organisationId: orgId, name: cleanName }
    });

    if (existing) {
      res.status(409).json({ error: 'Team already exists' });
      return;
    }

    const newTeam = await prisma.team.create({
      data: {
        organisationId: orgId,
        name: cleanName
      }
    });

    res.status(201).json(newTeam);
  } catch (err) {
    console.error('[teams] POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/invite — Admin sends invite link
router.post('/invite', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { email, role, teamName } = req.body;
    if (!email || !role) {
      res.status(400).json({ error: 'email and role are required' });
      return;
    }

    const validRoles = ['admin', 'team_leader', 'team_member'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });
    if (existingUser) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    // Delete any existing invites for this email/org
    await prisma.teamInvite.deleteMany({
      where: {
        organisationId: req.user.orgId,
        email,
      },
    }).catch(() => {});

    const invite = await prisma.teamInvite.create({
      data: {
        organisationId: req.user.orgId,
        email,
        role: role as any,
        teamName: teamName || null,
        createdById: req.user.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/accept?token=${invite.token}`;

    // Fetch org details to send high quality invitation email
    const org = await prisma.organisation.findUnique({
      where: { id: req.user.orgId },
      select: { name: true }
    });

    let emailSent = false;
    try {
      emailSent = await sendInvitationEmail(email, link, org?.name || 'your organisation');
    } catch (mailErr) {
      console.error('[teams.invite] Failed to send email:', mailErr);
    }

    res.status(201).json({ invite, link, emailSent });
  } catch (err) {
    console.error('[teams.invite] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/teams/invite/:token — Public: validate token and get details
router.get('/invite/:token', async (req: Request, res: Response) => {
  try {
    const invite = await prisma.teamInvite.findUnique({
      where: { token: req.params.token },
      include: { organisation: true },
    });

    if (!invite) {
      res.status(404).json({ error: 'Invalid or expired invitation link' });
      return;
    }
    if (invite.usedAt) {
      res.status(410).json({ error: 'This invitation has already been used' });
      return;
    }
    if (new Date() > invite.expiresAt) {
      res.status(410).json({ error: 'This invitation has expired' });
      return;
    }

    res.json({
      email: invite.email,
      role: invite.role,
      teamName: invite.teamName,
      organisationName: invite.organisation.name,
    });
  } catch (err) {
    console.error('[teams.invite.validate] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/invite/accept — Public: accept invite and create user
router.post('/invite/accept', async (req: Request, res: Response) => {
  try {
    const { token, fullName, password, whatsappNumber } = req.body;
    if (!token || !fullName || !password) {
      res.status(400).json({ error: 'token, fullName, and password are required' });
      return;
    }
    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const invite = await prisma.teamInvite.findUnique({
      where: { token },
    });

    if (!invite) {
      res.status(404).json({ error: 'Invalid invitation link' });
      return;
    }
    if (invite.usedAt) {
      res.status(410).json({ error: 'This invitation has already been used' });
      return;
    }
    if (new Date() > invite.expiresAt) {
      res.status(410).json({ error: 'This invitation has expired' });
      return;
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
    });
    if (existingUser) {
      res.status(409).json({ error: 'A user with this email already exists' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create the user
    const user = await prisma.user.create({
      data: {
        organisationId: invite.organisationId,
        email: invite.email,
        passwordHash,
        fullName,
        role: invite.role,
        teamName: invite.teamName,
        whatsappNumber: whatsappNumber || null,
        isActive: true,
      },
    });

    // Mark invite as used
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    res.status(201).json({
      message: 'Invitation accepted successfully',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        teamName: user.teamName,
      },
    });
  } catch (err) {
    console.error('[teams.invite.accept] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/teams/:name — ADMIN ONLY
router.delete('/:name', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const orgId = req.user.orgId;
    const name = decodeURIComponent(req.params.name).trim();

    await prisma.$transaction(async (tx) => {
      // 1. Delete from Team table
      await tx.team.deleteMany({
        where: { organisationId: orgId, name: { equals: name, mode: 'insensitive' } }
      });

      // 2. Clear user teamName
      await tx.user.updateMany({
        where: { organisationId: orgId, teamName: { equals: name, mode: 'insensitive' } },
        data: { teamName: null }
      });

      // 3. Clear step owningTeamName (set to 'Intake Team' as fallback)
      await tx.step.updateMany({
        where: { organisationId: orgId, owningTeamName: { equals: name, mode: 'insensitive' } },
        data: { owningTeamName: 'Intake Team' }
      });
    });

    res.json({ success: true });
  } catch (err) {
    console.error('[teams] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
