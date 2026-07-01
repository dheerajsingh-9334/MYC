import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// GET /api/teams
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const orgId = req.user.orgId;

    // Fetch teams from Team table
    const dbTeams = await prisma.team.findMany({
      where: { organisationId: orgId },
      select: { name: true }
    });

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
    
    // Seed default teams to make sure they are always present
    const defaultTeams = [
      'Intake Team', 'Sales Team', 'Design Team', 'Tech Team', 
      'Creative Team', 'Media Buyer', 'Automation Team', 'Event Team', 
      'Account Manager', 'Content Team'
    ];
    defaultTeams.forEach(t => teamNamesSet.add(t));

    dbTeams.forEach(t => t.name && teamNamesSet.add(t.name.trim()));
    userTeams.forEach(u => u.teamName && teamNamesSet.add(u.teamName.trim()));
    stepTeams.forEach(s => s.owningTeamName && teamNamesSet.add(s.owningTeamName.trim()));

    const teams = Array.from(teamNamesSet).sort();
    res.json(teams);
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

export default router;
