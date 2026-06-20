import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { computeClientStatus } from '../services/pipeline.service';

const router = Router();

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: { organisationId: req.user.orgId, status: 'active' },
      include: { tasks: true },
    });

    let onTrack = 0, dueToday = 0, overdue = 0;
    for (const client of clients) {
      const s = computeClientStatus(client.tasks);
      if (s === 'on_track') onTrack++;
      else if (s === 'due_today') dueToday++;
      else if (s === 'overdue' || s === 'blocked') overdue++;
    }

    res.json({ total: clients.length, onTrack, dueToday, overdue });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/admin — admin-only overview.
// Returns:
//   - high-level org stats
//   - per-team rollup: members, active tasks, completed (last 7d), overdue
//   - per-member rollup (top loaders): name, team, active, overdue, completed (last 7d)
//   - recent activity: 10 most recent task completions
router.get('/admin', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const { orgId } = req.user;

    const [
      totalClients,
      activeClients,
      completedClients,
      tasks,
      users,
      steps,
      recentCompletions,
    ] = await Promise.all([
      prisma.client.count({ where: { organisationId: orgId } }),
      prisma.client.count({ where: { organisationId: orgId, status: 'active' } }),
      prisma.client.count({ where: { organisationId: orgId, status: 'completed' } }),
      prisma.task.findMany({
        where: { organisationId: orgId },
        select: {
          id: true, status: true, priority: true, dueDate: true, completedAt: true,
          assignedToId: true, stepId: true,
          assignedTo: { select: { id: true, fullName: true, teamName: true, role: true } },
          step: { select: { id: true, name: true, owningTeamName: true, stepNumber: true } },
          client: { select: { id: true, brandName: true, fullName: true } },
        },
      }),
      prisma.user.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { id: true, fullName: true, role: true, teamName: true },
      }),
      prisma.step.findMany({
        where: { organisationId: orgId, isActive: true },
        select: { id: true, name: true, stepNumber: true, owningTeamName: true },
      }),
      prisma.task.findMany({
        where: { organisationId: orgId, status: 'complete' },
        orderBy: { completedAt: 'desc' },
        take: 10,
        include: {
          assignedTo: { select: { fullName: true } },
          client: { select: { brandName: true, fullName: true } },
          step: { select: { name: true, owningTeamName: true } },
        },
      }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeTasks = tasks.filter((t) => t.status !== 'complete' && t.status !== 'cancelled');
    const overdueTasks = activeTasks.filter((t) => new Date(t.dueDate) < today);
    const blockedTasks = activeTasks.filter((t) => t.status === 'blocked');
    const extensionTasks = activeTasks.filter((t) => t.status === 'extension_requested');

    const completedLast7d = tasks.filter((t) => t.status === 'complete' && t.completedAt && new Date(t.completedAt) >= sevenDaysAgo);
    const completedOnTime = completedLast7d.filter((t) => t.completedAt && new Date(t.completedAt) <= new Date(t.dueDate));
    const onTimePct = completedLast7d.length > 0 ? Math.round((completedOnTime.length / completedLast7d.length) * 100) : 0;

    // Per-team rollup
    const teamMap = new Map<string, {
      teamName: string;
      memberCount: number;
      leadCount: number;
      activeTasks: number;
      overdue: number;
      blocked: number;
      completedLast7d: number;
    }>();
    const ensureTeam = (name: string) => {
      if (!teamMap.has(name)) teamMap.set(name, {
        teamName: name, memberCount: 0, leadCount: 0,
        activeTasks: 0, overdue: 0, blocked: 0, completedLast7d: 0,
      });
      return teamMap.get(name)!;
    };
    for (const u of users) {
      const team = ensureTeam(u.teamName || '(Unassigned)');
      team.memberCount += 1;
      if (u.role === 'team_leader') team.leadCount += 1;
    }
    for (const t of activeTasks) {
      const team = ensureTeam(t.step.owningTeamName);
      team.activeTasks += 1;
      if (t.status === 'blocked') team.blocked += 1;
      if (new Date(t.dueDate) < today) team.overdue += 1;
    }
    for (const t of completedLast7d) {
      const team = ensureTeam(t.step.owningTeamName);
      team.completedLast7d += 1;
    }
    const teams = Array.from(teamMap.values()).sort((a, b) => a.teamName.localeCompare(b.teamName));

    // Per-member load
    const memberMap = new Map<string, {
      userId: string; name: string; team: string; role: string;
      active: number; overdue: number; blocked: number; completedLast7d: number;
    }>();
    for (const u of users) {
      memberMap.set(u.id, { userId: u.id, name: u.fullName, team: u.teamName || '—', role: u.role, active: 0, overdue: 0, blocked: 0, completedLast7d: 0 });
    }
    for (const t of activeTasks) {
      const m = memberMap.get(t.assignedToId);
      if (!m) continue;
      m.active += 1;
      if (t.status === 'blocked') m.blocked += 1;
      if (new Date(t.dueDate) < today) m.overdue += 1;
    }
    for (const t of completedLast7d) {
      const m = memberMap.get(t.assignedToId);
      if (!m) continue;
      m.completedLast7d += 1;
    }
    const members = Array.from(memberMap.values()).sort((a, b) => b.active - a.active);

    // Per-step rollup
    const stepRollup = steps.map((s) => {
      const stepActive = activeTasks.filter((t) => t.stepId === s.id);
      const stepCompleted = completedLast7d.filter((t) => t.stepId === s.id).length;
      return {
        stepId: s.id, stepNumber: s.stepNumber, name: s.name, owningTeamName: s.owningTeamName,
        activeTasks: stepActive.length,
        overdue: stepActive.filter((t) => new Date(t.dueDate) < today).length,
        blocked: stepActive.filter((t) => t.status === 'blocked').length,
        completedLast7d: stepCompleted,
      };
    });

    res.json({
      orgStats: {
        totalClients,
        activeClients,
        completedClients,
        totalTasks: tasks.length,
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        blockedTasks: blockedTasks.length,
        extensionTasks: extensionTasks.length,
        completedLast7d: completedLast7d.length,
        onTimePct,
      },
      teams,
      members,
      stepRollup,
      recentCompletions: recentCompletions.map((t) => ({
        id: t.id,
        title: t.title,
        completedAt: t.completedAt,
        assignee: t.assignedTo?.fullName,
        team: t.step.owningTeamName,
        client: t.client?.brandName || t.client?.fullName,
        step: t.step.name,
      })),
    });
  } catch (err) {
    console.error('[dashboard.admin] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
