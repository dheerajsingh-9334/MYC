import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';
import { computeClientStatus } from '../services/pipeline.service';

const router = Router();

// GET /api/dashboard/stats
router.get('/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const allClients = await prisma.client.findMany({
      where: { organisationId: req.user.orgId },
      include: { tasks: true },
    });
    const activeClients = allClients.filter((c) => c.status === 'active');
    const pipelineClients = allClients.filter((c) => c.status !== 'active');

    let onTrack = 0, dueToday = 0, overdue = 0;
    for (const client of activeClients) {
      const s = computeClientStatus(client.tasks);
      if (s === 'on_track') onTrack++;
      else if (s === 'due_today') dueToday++;
      else if (s === 'overdue' || s === 'blocked') overdue++;
    }

    const total = activeClients.length;
    const onTrackPct = total > 0 ? Math.round((onTrack / total) * 100) : 0;

    res.json({
      total,
      totalAll: allClients.length,
      active: activeClients.length,
      pipeline: pipelineClients.length,
      onTrack,
      onTrackPct,
      dueToday,
      overdue,
    });
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
    if (req.user.role !== 'admin' && req.user.role !== 'team_leader') {
      res.status(403).json({ error: 'Admin or Team Leader only' });
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
      completedClientsList,
      allClientsList,
      histories,
    ] = await Promise.all([
      prisma.client.count({ where: { organisationId: orgId } }),
      prisma.client.count({ where: { organisationId: orgId, status: 'active' } }),
      prisma.client.count({ where: { organisationId: orgId, status: 'completed' } }),
      prisma.task.findMany({
        where: { organisationId: orgId },
        select: {
          id: true, title: true, status: true, priority: true, dueDate: true, completedAt: true,
          assignedToId: true, stepId: true,
          extensionRequestedDate: true, extensionReason: true,
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
        where: { organisationId: orgId, clientId: null, isActive: true },
        select: { id: true, name: true, stepNumber: true, owningTeamName: true },
      }),
      prisma.task.findMany({
        where: { organisationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          assignedTo: { select: { fullName: true } },
          client: { select: { brandName: true, fullName: true } },
          step: { select: { name: true, owningTeamName: true } },
          completedBy: { select: { fullName: true } },
        },
      }),
      prisma.client.findMany({
        where: { organisationId: orgId, status: 'completed' },
        include: { stepHistory: { orderBy: { createdAt: 'desc' }, take: 1 } },
      }),
      prisma.client.findMany({
        where: { organisationId: orgId },
      }),
      prisma.stepHistory.findMany({
        where: { organisationId: orgId },
        include: {
          fromStep: { select: { stepNumber: true } },
          toStep: { select: { stepNumber: true } },
        },
        orderBy: { createdAt: 'asc' },
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
    const inProgressTasks = activeTasks.filter((t) => t.status === 'in_progress');

    // Calculate average completion time
    let totalDurationDays = 0;
    let completedCount = 0;
    for (const c of completedClientsList) {
      const completionDate = c.stepHistory[0]?.createdAt || c.createdAt;
      const joinedDate = c.dateJoined || c.createdAt;
      const durationMs = completionDate.getTime() - joinedDate.getTime();
      const durationDays = Math.max(0, Math.round(durationMs / (1000 * 60 * 60 * 24)));
      totalDurationDays += durationDays;
      completedCount++;
    }
    const avgCompletionTimeDays = completedCount > 0 ? Math.round(totalDurationDays / completedCount) : 0;

    const completedLast7d = tasks.filter((t) => t.status === 'complete' && t.completedAt && new Date(t.completedAt) >= sevenDaysAgo);
    const completedOnTime = completedLast7d.filter((t) => t.completedAt && new Date(t.completedAt) <= new Date(t.dueDate));
    const onTimePct = completedLast7d.length > 0 ? Math.round((completedOnTime.length / completedLast7d.length) * 100) : 0;

    // Calculate step transition timings across all clients
    const clientJoinedMap = new Map(allClientsList.map(c => [c.id, c.dateJoined || c.createdAt]));
    
    // Group histories by client
    const clientHistories = new Map<string, typeof histories>();
    histories.forEach(h => {
      if (!clientHistories.has(h.clientId)) {
        clientHistories.set(h.clientId, []);
      }
      clientHistories.get(h.clientId)!.push(h);
    });

    const stepStays = new Map<number, number[]>(); // stepNumber -> array of durations in ms

    allClientsList.forEach(client => {
      const cHist = clientHistories.get(client.id) || [];
      const joined = clientJoinedMap.get(client.id) || client.createdAt;
      
      if (cHist.length === 0) {
        const end = new Date();
        const duration = end.getTime() - joined.getTime();
        if (duration > 0) {
          const arr = stepStays.get(1) || [];
          arr.push(duration);
          stepStays.set(1, arr);
        }
        return;
      }

      let lastTime = joined.getTime();
      let lastStepNum = 1;

      cHist.forEach((h) => {
        if (!h.toStep) return;
        const currTime = h.createdAt.getTime();
        const duration = currTime - lastTime;
        if (duration > 0 && lastStepNum >= 1 && lastStepNum <= 9) {
          const arr = stepStays.get(lastStepNum) || [];
          arr.push(duration);
          stepStays.set(lastStepNum, arr);
        }
        lastTime = currTime;
        lastStepNum = h.toStep.stepNumber;
      });

      if (client.status !== 'completed') {
        const duration = Date.now() - lastTime;
        if (duration > 0 && lastStepNum >= 1 && lastStepNum <= 9) {
          const arr = stepStays.get(lastStepNum) || [];
          arr.push(duration);
          stepStays.set(lastStepNum, arr);
        }
      }
    });

    const avgStepDurations = new Map<number, number>();
    for (let stepNum = 1; stepNum <= 9; stepNum++) {
      const stays = stepStays.get(stepNum) || [];
      if (stays.length > 0) {
        const totalMs = stays.reduce((sum, val) => sum + val, 0);
        const avgDays = totalMs / stays.length / (1000 * 60 * 60 * 24);
        avgStepDurations.set(stepNum, parseFloat(avgDays.toFixed(1)));
      } else {
        avgStepDurations.set(stepNum, 0);
      }
    }

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
      const teamName = t.step?.owningTeamName || t.assignedTo?.teamName || '(Unassigned)';
      const team = ensureTeam(teamName);
      team.activeTasks += 1;
      if (t.status === 'blocked') team.blocked += 1;
      if (new Date(t.dueDate) < today) team.overdue += 1;
    }
    for (const t of completedLast7d) {
      const teamName = t.step?.owningTeamName || t.assignedTo?.teamName || '(Unassigned)';
      const team = ensureTeam(teamName);
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
      const stepActive = activeTasks.filter((t) => t.step?.name === s.name);
      const stepCompleted = completedLast7d.filter((t) => t.step?.name === s.name).length;
      return {
        stepId: s.id, stepNumber: s.stepNumber, name: s.name, owningTeamName: s.owningTeamName,
        activeTasks: stepActive.length,
        overdue: stepActive.filter((t) => new Date(t.dueDate) < today).length,
        blocked: stepActive.filter((t) => t.status === 'blocked').length,
        completedLast7d: stepCompleted,
        averageDurationDays: avgStepDurations.get(s.stepNumber) || 0,
      };
    });

    const logs: any[] = [];
    (recentCompletions as any[]).forEach((t: any) => {
      logs.push({
        id: `${t.id}-created`,
        title: t.title,
        completedAt: t.createdAt,
        assignee: t.assignedTo?.fullName || 'Unassigned',
        team: t.step?.owningTeamName || '(Unassigned)',
        client: t.client?.brandName || t.client?.fullName || 'General',
        step: t.step?.name || 'Task Created',
        action: 'created',
        message: `${t.assignedTo?.fullName || 'Unassigned'} was assigned task "${t.title}"`
      });

      if (t.inProgressAt) {
        logs.push({
          id: `${t.id}-inprogress`,
          title: t.title,
          completedAt: t.inProgressAt,
          assignee: t.assignedTo?.fullName || 'Unassigned',
          team: t.step?.owningTeamName || '(Unassigned)',
          client: t.client?.brandName || t.client?.fullName || 'General',
          step: t.step?.name || 'Task Started',
          action: 'in_progress',
          message: `${t.assignedTo?.fullName || 'Unassigned'} started task "${t.title}"`
        });
      }

      if (t.completedAt) {
        logs.push({
          id: `${t.id}-completed`,
          title: t.title,
          completedAt: t.completedAt,
          assignee: t.completedBy?.fullName || t.assignedTo?.fullName || 'Unassigned',
          team: t.step?.owningTeamName || '(Unassigned)',
          client: t.client?.brandName || t.client?.fullName || 'General',
          step: t.step?.name || 'Task Completed',
          action: 'completed',
          message: `${t.completedBy?.fullName || t.assignedTo?.fullName || 'Unassigned'} completed task "${t.title}"`
        });
      }

      if (t.status === 'blocked') {
        logs.push({
          id: `${t.id}-blocked`,
          title: t.title,
          completedAt: t.createdAt,
          assignee: t.assignedTo?.fullName || 'Unassigned',
          team: t.step?.owningTeamName || '(Unassigned)',
          client: t.client?.brandName || t.client?.fullName || 'General',
          step: t.step?.name || 'Task Blocked',
          action: 'blocked',
          message: `Task "${t.title}" was blocked`
        });
      }
    });

    logs.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const finalRecentCompletions = logs.slice(0, 50);

    res.json({
      orgStats: {
        totalClients,
        activeClients,
        completedClients,
        avgCompletionTimeDays,
        totalTasks: tasks.length,
        activeTasks: activeTasks.length,
        overdueTasks: overdueTasks.length,
        blockedTasks: blockedTasks.length,
        extensionTasks: extensionTasks.length,
        inProgressTasks: inProgressTasks.length,
        completedLast7d: completedLast7d.length,
        onTimePct,
      },
      teams,
      members,
      stepRollup,
      recentCompletions: finalRecentCompletions,
      pendingExtensions: extensionTasks.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate,
        extensionRequestedDate: t.extensionRequestedDate,
        extensionReason: t.extensionReason,
        assignee: t.assignedTo?.fullName,
        team: t.step?.owningTeamName,
        client: t.client?.brandName || t.client?.fullName,
        step: t.step?.name,
      })),
    });
  } catch (err) {
    console.error('[dashboard.admin] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/dashboard/staff — staff-scoped KPIs for the 2x2 grid on /dashboard.
// Returns counts of activity that is meaningful to a single team member:
//   - joinedThisWeek:   clients onboarded (created) in the last 7 days, scoped to clients whose
//                      current step is owned by this user's team (best-effort). For team_leader /
//                      team_member we attribute by team; for admin we attribute by createdById.
//   - tasksCompleted:  tasks the user marked complete in the last 7 days.
//   - dueIn7d:         tasks assigned to the user, not yet complete, due within the next 7 days.
//   - stepAdvances:    clients whose current step advanced in the last 7 days where the *to* step
//                      is owned by this user's team (or any step if no team match).
router.get('/staff', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user.userId;
    const orgId = req.user.orgId;
    const userTeam = req.user.teamName || null;

    // Window can be "week" (7 days) or "month" (30 days). Default to week.
    const windowDays = req.query.window === 'month' ? 30 : 7;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - windowDays);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + windowDays);

    // Tasks assigned to me (the source for tasksCompleted + dueIn7d)
    const myTasks = await prisma.task.findMany({
      where: { organisationId: orgId, assignedToId: userId },
      select: {
        id: true, status: true, dueDate: true, completedAt: true, clientId: true,
      },
    });

    const tasksCompleted = myTasks.filter(
      (t) => t.status === 'complete' && t.completedAt && new Date(t.completedAt) >= windowStart
    ).length;

    const dueIn7d = myTasks.filter((t) => {
      if (t.status === 'complete' || t.status === 'cancelled') return false;
      const due = new Date(t.dueDate);
      return due >= today && due <= windowEnd;
    }).length;

    // Joined this week — clients created in the last 7 days, scoped to this user's "scope":
    //   - team_member/team_leader: clients whose current step is owned by their team
    //   - admin: all clients (org-wide view)
    // We pull steps owned by the user's team and then count clients created in the window
    // currently sitting on one of those steps.
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, teamName: true } });
    const isAdmin = user?.role === 'admin';

    let joinedScope: { id: string }[] | null = null;
    if (!isAdmin && userTeam) {
      const teamSteps = await prisma.step.findMany({
        where: { organisationId: orgId, owningTeamName: userTeam, isActive: true },
        select: { id: true },
      });
      const stepIds = teamSteps.map((s) => s.id);
      if (stepIds.length === 0) {
        // No team steps — leave at 0
        joinedScope = [];
      } else {
        joinedScope = await prisma.client.findMany({
          where: {
            organisationId: orgId,
            status: 'active',
            currentStepId: { in: stepIds },
            createdAt: { gte: windowStart },
          },
          select: { id: true },
        });
      }
    } else {
      joinedScope = await prisma.client.findMany({
        where: { organisationId: orgId, createdAt: { gte: windowStart } },
        select: { id: true },
      });
    }
    const joinedThisWeek = joinedScope?.length ?? 0;

    // Step advances in the last 7 days — clients whose step moved. For team scope: only
    // advances into a step owned by this user's team. For admin: all advances.
    // Average time to complete a task — measured from task creation to completedAt.
    // We average over the user's last 30 completions (recent window) so the number
    // reflects current pace rather than lifetime history. If they haven't completed
    // anything yet, avgCompleteMinutes is null.
    const recentCompleted = await prisma.task.findMany({
      where: {
        organisationId: orgId,
        assignedToId: userId,
        status: 'complete',
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: 30,
      select: { createdAt: true, completedAt: true },
    });

    let avgCompleteMinutes: number | null = null;
    if (recentCompleted.length > 0) {
      const totalMs = recentCompleted.reduce((sum, t) => {
        const c = t.completedAt ? new Date(t.completedAt).getTime() : 0;
        const cr = new Date(t.createdAt).getTime();
        return sum + Math.max(0, c - cr);
      }, 0);
      avgCompleteMinutes = Math.round(totalMs / recentCompleted.length / 60000);
    }

    // Step advances in the last 7 days
    let stepAdvancesWhere: any = {
      organisationId: orgId,
      createdAt: { gte: windowStart }
    };
    if (!isAdmin && userTeam) {
      const teamSteps = await prisma.step.findMany({
        where: { organisationId: orgId, owningTeamName: userTeam, isActive: true },
        select: { id: true },
      });
      const teamStepIds = teamSteps.map(s => s.id);
      stepAdvancesWhere.toStepId = { in: teamStepIds };
    }
    const stepAdvances = await prisma.stepHistory.count({
      where: stepAdvancesWhere
    });

    // Pipeline Distribution (active client counts per step)
    const stepsList = await prisma.step.findMany({
      where: { organisationId: orgId, clientId: null, isActive: true },
      orderBy: { stepNumber: 'asc' }
    });
    const activeClients = await prisma.client.findMany({
      where: { organisationId: orgId, status: 'active' },
      include: { currentStep: true }
    });
    const pipelineDistribution = stepsList.map(step => {
      const count = activeClients.filter(c => c.currentStep?.name === step.name).length;
      return {
        id: step.id,
        stepNumber: step.stepNumber,
        name: step.name,
        clientCount: count
      };
    });

    res.json({
      joinedThisWeek,
      tasksCompleted,
      dueIn7d,
      stepAdvances,
      avgCompleteMinutes,
      pipelineDistribution,
      windowDays,
    });
  } catch (err) {
    console.error('[dashboard.staff] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
