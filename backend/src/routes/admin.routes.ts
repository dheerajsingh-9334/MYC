import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// Default pipeline definition for MyC Ops.
// Idempotent: if the org already has steps, this returns the existing list
// (unless `force`=true is passed, in which case it WIPES & re-creates).
const DEFAULT_STEPS: Array<{
  stepNumber: number;
  name: string;
  owningTeamName: string;
  slaDays: number;
  description: string;
  taskTemplates: Array<{
    title: string;
    description: string;
    relativeDueDay: number;
    priority: 'high' | 'normal';
    sortOrder: number;
  }>;
}> = [
  {
    stepNumber: 1,
    name: 'Onboarding Intake',
    owningTeamName: 'Intake Team',
    slaDays: 3,
    description: 'Client signs paperwork, completes kickoff call, fills brand questionnaire.',
    taskTemplates: [
      { title: 'Send welcome packet', description: 'Welcome email + welcome PDF with what to expect.', relativeDueDay: 0, priority: 'high', sortOrder: 0 },
      { title: 'Schedule kickoff call', description: 'Find a 45-min slot in the next 3 days.', relativeDueDay: 1, priority: 'high', sortOrder: 1 },
      { title: 'Collect signed contract', description: 'Upload signed agreement to Documents.', relativeDueDay: 2, priority: 'normal', sortOrder: 2 },
      { title: 'Send brand questionnaire', description: 'Send the 20-question intake form.', relativeDueDay: 2, priority: 'normal', sortOrder: 3 },
    ],
  },
  {
    stepNumber: 2,
    name: 'Brand & Content Setup',
    owningTeamName: 'Content Team',
    slaDays: 7,
    description: 'Brand voice, positioning, content pillars, and first batch of content ideas.',
    taskTemplates: [
      { title: 'Run brand voice workshop', description: '90-min session to lock voice, tone, and positioning.', relativeDueDay: 0, priority: 'high', sortOrder: 0 },
      { title: 'Build content pillars doc', description: '3-5 content pillars with examples for each.', relativeDueDay: 3, priority: 'normal', sortOrder: 1 },
      { title: 'Pitch 10 content ideas', description: 'Hooks, formats, and angle for 10 first posts.', relativeDueDay: 5, priority: 'normal', sortOrder: 2 },
    ],
  },
  {
    stepNumber: 3,
    name: 'Content Production',
    owningTeamName: 'Content Team',
    slaDays: 10,
    description: 'Write, design, and produce the first month of content.',
    taskTemplates: [
      { title: 'Write 12 posts', description: '12 captions with hooks and CTAs.', relativeDueDay: 6, priority: 'high', sortOrder: 0 },
      { title: 'Design 12 graphics', description: '12 carousels/statics in Canva or Figma.', relativeDueDay: 8, priority: 'high', sortOrder: 1 },
      { title: 'Internal review', description: 'Cross-team check on voice, brand, and CTAs.', relativeDueDay: 9, priority: 'normal', sortOrder: 2 },
    ],
  },
  {
    stepNumber: 4,
    name: 'Launch & Schedule',
    owningTeamName: 'Media Buyer',
    slaDays: 5,
    description: 'Posts go live, profiles are polished, and engagement loops are in place.',
    taskTemplates: [
      { title: 'Optimize bio & highlights', description: 'New bio, profile photo, and 5 IG highlights.', relativeDueDay: 0, priority: 'high', sortOrder: 0 },
      { title: 'Schedule first 12 posts', description: 'Queue posts in the scheduler with optimal times.', relativeDueDay: 2, priority: 'high', sortOrder: 1 },
      { title: 'Set up DM auto-replies', description: 'Welcome DM, FAQ DM, and link-in-bio routing.', relativeDueDay: 3, priority: 'normal', sortOrder: 2 },
    ],
  },
  {
    stepNumber: 5,
    name: 'Handover & Retainer',
    owningTeamName: 'Account Manager',
    slaDays: 2,
    description: 'Hand off to the long-term owner and start the retainer cycle.',
    taskTemplates: [
      { title: 'Send 30-day report', description: 'Reach, engagement, follower delta, top posts.', relativeDueDay: 0, priority: 'high', sortOrder: 0 },
      { title: 'Recap call', description: '60-min review of the first 30 days + next quarter.', relativeDueDay: 1, priority: 'normal', sortOrder: 1 },
      { title: 'Move to retainer cadence', description: 'Set monthly task template, weekly check-in.', relativeDueDay: 2, priority: 'normal', sortOrder: 2 },
    ],
  },
];

// POST /api/admin/seed-steps
// Body: { force?: boolean }
//   - default: only seeds if no steps exist
//   - force: true → WIPES existing steps + templates (does NOT touch clients)
router.post('/seed-steps', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const force = Boolean(req.body?.force);
    const existing = await prisma.step.count({ where: { organisationId: req.user.orgId } });

    if (existing > 0 && !force) {
      const steps = await prisma.step.findMany({
        where: { organisationId: req.user.orgId },
        include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
        orderBy: { stepNumber: 'asc' },
      });
      res.json({ message: 'Pipeline already initialized', seeded: false, steps });
      return;
    }

    if (force) {
      // Detach clients from their current steps to avoid FK violations.
      // Move them to step 1 (will be re-created below) — for active clients
      // we just clear currentStepId, the admin can reassign manually.
      await prisma.client.updateMany({
        where: { organisationId: req.user.orgId },
        data: { currentStepId: undefined },
      });
      // Delete task templates first (FK), then tasks, then steps
      await prisma.stepTaskTemplate.deleteMany({ where: { organisationId: req.user.orgId } });
      await prisma.task.deleteMany({ where: { organisationId: req.user.orgId } });
      await prisma.step.deleteMany({ where: { organisationId: req.user.orgId } });
    }

    // Create steps + templates
    const created = [];
    for (const s of DEFAULT_STEPS) {
      const step = await prisma.step.create({
        data: {
          organisationId: req.user.orgId,
          stepNumber: s.stepNumber,
          name: s.name,
          owningTeamName: s.owningTeamName,
          slaDays: s.slaDays,
          description: s.description,
          isActive: true,
        },
      });
      for (const t of s.taskTemplates) {
        await prisma.stepTaskTemplate.create({
          data: {
            stepId: step.id,
            organisationId: req.user.orgId,
            title: t.title,
            description: t.description,
            relativeDueDay: t.relativeDueDay,
            priority: t.priority,
            sortOrder: t.sortOrder,
          },
        });
      }
      created.push(step);
    }

    const steps = await prisma.step.findMany({
      where: { organisationId: req.user.orgId },
      include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { stepNumber: 'asc' },
    });

    res.json({ message: force ? 'Pipeline re-seeded' : 'Pipeline seeded', seeded: true, steps });
  } catch (err: any) {
    console.error('[admin.seed-steps] error:', err);
    res.status(500).json({ error: err?.message || 'Internal server error' });
  }
});

// GET /api/admin/seed-status
// Returns whether the org has steps and how many templates each step has.
router.get('/seed-status', requireAuth, async (req: Request, res: Response) => {
  try {
    const steps = await prisma.step.findMany({
      where: { organisationId: req.user.orgId },
      include: { _count: { select: { taskTemplates: true } } },
      orderBy: { stepNumber: 'asc' },
    });
    res.json({
      initialized: steps.length > 0,
      stepCount: steps.length,
      totalTemplates: steps.reduce((sum, s) => sum + s._count.taskTemplates, 0),
      steps: steps.map((s) => ({ id: s.id, stepNumber: s.stepNumber, name: s.name, templates: s._count.taskTemplates })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function getPipelineStats(orgId: string) {
  const [
    totalClients,
    activeClients,
    completedClients,
    tasks,
    users,
    steps,
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
  const clientHistories = new Map<string, typeof histories>();
  histories.forEach(h => {
    if (!clientHistories.has(h.clientId)) {
      clientHistories.set(h.clientId, []);
    }
    clientHistories.get(h.clientId)!.push(h);
  });

  const stepStays = new Map<number, number[]>();
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

  return {
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
    stepRollup,
  };
}

// GET /api/admin/export
// Exports reports or database backup in CSV, JSON or HTML (for PDF print)
router.get('/export', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const format = (req.query.format as string) || 'csv';
    const type = (req.query.type as string) || 'client_full';

    // Filters
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const stepId = req.query.stepId as string;
    const status = req.query.status as string;
    const team = req.query.team as string;
    const assignedToId = req.query.assignedToId as string;
    const clientId = req.query.clientId as string;
    const priority = req.query.priority as string;
    const completed = req.query.completed as string; // 'true' | 'false' | 'all'
    const includeArchived = req.query.includeArchived === 'true';

    const orgId = req.user.orgId;

    if (type === 'backup') {
      const [clients, users, teams, tasks, templates, steps] = await Promise.all([
        prisma.client.findMany({ where: { organisationId: orgId } }),
        prisma.user.findMany({ where: { organisationId: orgId } }),
        prisma.team.findMany({ where: { organisationId: orgId } }),
        prisma.task.findMany({ where: { organisationId: orgId } }),
        prisma.stepTaskTemplate.findMany({ where: { organisationId: orgId } }),
        prisma.step.findMany({ where: { organisationId: orgId } }),
      ]);

      const backupData = { clients, users, teams, tasks, templates, steps };
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="myc_ops_backup_${Date.now()}.json"`);
      res.send(JSON.stringify(backupData, null, 2));
      return;
    }

    const clientWhereClause: any = { organisationId: orgId };
    if (!includeArchived) {
      clientWhereClause.status = { notIn: ['churned'] };
    }
    if (clientId) {
      clientWhereClause.id = clientId;
    }
    if (status && (type === 'clients' || type === 'client_full')) {
      clientWhereClause.status = status;
    }
    if (stepId && (type === 'clients' || type === 'client_full')) {
      clientWhereClause.currentStepId = stepId;
    }

    if (type === 'projects') {
      const pipelineData = await getPipelineStats(orgId);
      const clients = await prisma.client.findMany({
        where: clientWhereClause,
        include: {
          currentStep: true,
          tasks: {
            include: { assignedTo: true, step: true }
          }
        },
        orderBy: { brandName: 'asc' }
      });

      const users = await prisma.user.findMany({
        where: { organisationId: orgId }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      if (format === 'csv') {
        let csv = 'Project ID,Project Name,Client Name,Project Status,Priority,Manager,Team Members,Start Date,Due Date,Completion %,Budget,Total Tasks,Completed Tasks,Pending Tasks,Created By,Created At,Last Updated\n';
        clients.forEach(c => {
          const totalTasks = c.tasks.length;
          const completedTasks = c.tasks.filter(t => t.status === 'complete').length;
          const pendingTasks = c.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
          const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          
          let statusLabel = 'Not Started';
          if (c.status === 'completed') statusLabel = 'Completed';
          else if (c.status === 'paused') statusLabel = 'On Hold';
          else if (totalTasks > 0) statusLabel = 'Active';

          let priority = 'Low';
          const priorities = c.tasks.map(t => t.priority);
          if (priorities.includes('high')) priority = 'High';
          else if (priorities.length > 0) priority = 'Normal';

          const creator = userMap.get(c.createdById);
          const creatorName = creator?.fullName || 'System';
          const managerName = c.currentStep?.owningTeamName || 'Unassigned';

          const assignees = Array.from(new Set(c.tasks.map(t => t.assignedTo?.fullName).filter(Boolean)));
          const teamMembersStr = assignees.join('; ');

          const dueDates = c.tasks.map(t => new Date(t.dueDate).getTime());
          const maxDueDate = dueDates.length > 0 ? new Date(Math.max(...dueDates)) : null;
          const dueDateStr = maxDueDate ? maxDueDate.toISOString() : '';

          csv += `"${c.id}","${c.brandName || ''}","${c.fullName}","${statusLabel}","${priority}","${managerName}","${teamMembersStr}","${c.dateJoined.toISOString()}","${dueDateStr}",${completionPct},"N/A",${totalTasks},${completedTasks},${pendingTasks},"${creatorName}","${c.createdAt.toISOString()}","${c.createdAt.toISOString()}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="projects_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        const totalCount = clients.length;
        const completedCount = clients.filter(c => c.status === 'completed').length;
        const activeCount = clients.filter(c => c.status !== 'completed' && c.status !== 'paused' && c.tasks.length > 0).length;
        const onHoldCount = clients.filter(c => c.status === 'paused').length;
        const notStartedCount = clients.filter(c => c.status !== 'completed' && c.status !== 'paused' && c.tasks.length === 0).length;

        const completedPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        const activePct = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
        const onHoldPct = totalCount > 0 ? Math.round((onHoldCount / totalCount) * 100) : 0;
        const notStartedPct = totalCount > 0 ? Math.round((notStartedCount / totalCount) * 100) : 0;

        let html = `<html>
<head>
  <title>Projects Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1a2310; background-color: #fff; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #5F6F52; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #5F6F52; margin: 0 0 8px 0; }
    .header p { font-size: 14px; color: #666; margin: 0; }
    .logo-text { font-family: Georgia, serif; font-size: 24px; font-style: italic; color: #5F6F52; }
    
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
    .kpi-card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 10px; padding: 15px; text-align: center; }
    .kpi-num { font-size: 26px; font-weight: 700; color: #2c3820; }
    .kpi-label { font-size: 11px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    
    .chart-container { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .segmented-bar { height: 18px; display: flex; border-radius: 9px; overflow: hidden; background: #eee; margin-bottom: 12px; }
    .segment { height: 100%; }
    .segment-completed { background-color: #2e7d32; }
    .segment-active { background-color: #2860A1; }
    .segment-onhold { background-color: #D97706; }
    .segment-notstarted { background-color: #7f8c8d; }
    
    .legend-container { display: flex; gap: 20px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-completed { background-color: #2e7d32; }
    .dot-active { background-color: #2860A1; }
    .dot-onhold { background-color: #D97706; }
    .dot-notstarted { background-color: #7f8c8d; }
    
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eef2eb; }
    th { background-color: #f5f8f2; color: #5F6F52; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-active { background: #e3f2fd; color: #1565c0; }
    .badge-on_hold { background: #fff8e1; color: #f57f17; }
    .badge-completed { background: #e8f5e9; color: #2e7d32; }
    .badge-not_started { background: #eceff1; color: #37474f; }
    
    .card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; }
    .card-title { font-size: 14px; font-weight: 700; color: #5F6F52; margin: 0 0 10px 0; }
    .pipeline-section { margin-top: 30px; border-top: 1px solid #eef2eb; padding-top: 30px; page-break-inside: avoid; }
    .pipeline-section h2 { font-size: 18px; font-weight: 700; color: #5F6F52; margin: 0 0 5px 0; }
    .section-subtitle { font-size: 12px; color: #666; margin: 0 0 20px 0; }
    
    @media print {
      body { padding: 0; }
      .kpi-card, .chart-container, .card, .pipeline-section, tr { page-break-inside: avoid; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <h1>Projects Portfolio Report</h1>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="logo-text">MyC Operations</div>
  </div>
  
  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-num">${totalCount}</div>
      <div class="kpi-label">Total Projects</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2e7d32;">${completedCount}</div>
      <div class="kpi-label">Completed</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2860A1;">${activeCount}</div>
      <div class="kpi-label">Active</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #D97706;">${onHoldCount}</div>
      <div class="kpi-label">On Hold</div>
    </div>
  </div>
  
  <div class="chart-container">
    <div style="font-size: 13px; font-weight: 600; color: #5F6F52; margin-bottom: 8px;">Project Portfolio Status Distribution</div>
    <div class="segmented-bar">
      ${completedPct > 0 ? `<div class="segment segment-completed" style="width: ${completedPct}%" title="Completed"></div>` : ''}
      ${activePct > 0 ? `<div class="segment segment-active" style="width: ${activePct}%" title="Active"></div>` : ''}
      ${onHoldPct > 0 ? `<div class="segment segment-onhold" style="width: ${onHoldPct}%" title="On Hold"></div>` : ''}
      ${notStartedPct > 0 ? `<div class="segment segment-notstarted" style="width: ${notStartedPct}%" title="Not Started"></div>` : ''}
    </div>
    <div class="legend-container">
      <div class="legend-item"><span class="dot dot-completed"></span> Completed (${completedCount})</div>
      <div class="legend-item"><span class="dot dot-active"></span> Active (${activeCount})</div>
      <div class="legend-item"><span class="dot dot-onhold"></span> On Hold (${onHoldCount})</div>
      <div class="legend-item"><span class="dot dot-notstarted"></span> Not Started (${notStartedCount})</div>
    </div>
  </div>

  <!-- Pipeline KPI & Stage Performance -->
  <div class="pipeline-section">
    <h2>Pipeline KPI & Stage Performance</h2>
    <p class="section-subtitle">Active client distribution, task statuses, and average stage durations across the pipeline</p>
    
    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 30px; margin-bottom: 30px;">
      <!-- Active Client Distribution per Step -->
      <div class="card">
        <h3 class="card-title">Active Client Distribution per Step</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px;">
          ${pipelineData.stepRollup.map((step: any) => {
            const totalTasks = step.activeTasks + step.completedLast7d;
            const overdueBlocked = step.overdue + step.blocked;
            const completed = step.completedLast7d;
            const inProgress = Math.max(0, step.activeTasks - overdueBlocked);
            
            const sum = Math.max(totalTasks, 1);
            const pctCompleted = (completed / sum) * 100;
            const pctOverdue = (overdueBlocked / sum) * 100;
            const pctInProgress = (inProgress / sum) * 100;
            
            return `
              <div style="display: grid; grid-template-columns: 140px 1fr 140px; gap: 12px; align-items: center;">
                <div style="font-size: 12.5px; font-weight: 600; color: #2c3820; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                  S${step.stepNumber}. ${step.name}
                </div>
                
                <div class="segmented-bar" style="height: 14px; margin-bottom: 0; background: #eee; border-radius: 4px; overflow: hidden; display: flex;">
                  \${completed > 0 ? \`<div style="width: \${pctCompleted}%; background-color: #2e7d32; height: 100%;"></div>\` : ''}
                  \${inProgress > 0 ? \`<div style="width: \${pctInProgress}%; background-color: #5F6F52; height: 100%;"></div>\` : ''}
                  \${overdueBlocked > 0 ? \`<div style="width: \${pctOverdue}%; background-color: #c62828; height: 100%;"></div>\` : ''}
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: #666;">
                  <span style="font-weight: 600; color: \${step.activeTasks > 0 ? '#1a2310' : '#888'};">\${step.activeTasks} active</span>
                  <span>\${step.averageDurationDays || 0}d avg</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <!-- Legend -->
        <div style="display: flex; gap: 15px; font-size: 11px; justify-content: center; margin-top: 15px; border-top: 1px solid #e1e8db; padding-top: 10px;">
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-completed"></span> Done (last 7d)</div>
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-active"></span> Active</div>
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-onhold" style="background-color: #c62828;"></span> Late / Blocked</div>
        </div>
      </div>

      <!-- Pipeline Performance Benchmarks -->
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 class="card-title">Pipeline Performance Benchmarks</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 15px;">
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #2e7d32;">${pipelineData.orgStats.onTimePct}%</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Task On-Time Rate</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #5F6F52;">${pipelineData.orgStats.avgCompletionTimeDays || 0}d</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Avg Cycle Time</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #2c3820;">${pipelineData.stepRollup.reduce((acc: number, curr: any) => acc + curr.activeTasks, 0)}</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Total Active Tasks</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #c62828;">${pipelineData.orgStats.overdueTasks}</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Critical Overdue Steps</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Project Name</th>
        <th>Client Name</th>
        <th>Status</th>
        <th>Priority</th>
        <th>Team Members</th>
        <th>Completion %</th>
        <th>Tasks (Done/Total)</th>
      </tr>
    </thead>
    <tbody>`;

        clients.forEach(c => {
          const totalTasks = c.tasks.length;
          const completedTasks = c.tasks.filter(t => t.status === 'complete').length;
          const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
          
          let statusLabel = 'Not Started';
          let badgeClass = 'badge-not_started';
          if (c.status === 'completed') {
            statusLabel = 'Completed';
            badgeClass = 'badge-completed';
          } else if (c.status === 'paused') {
            statusLabel = 'On Hold';
            badgeClass = 'badge-on_hold';
          } else if (totalTasks > 0) {
            statusLabel = 'Active';
            badgeClass = 'badge-active';
          }

          let priority = 'Low';
          const priorities = c.tasks.map(t => t.priority);
          if (priorities.includes('high')) priority = 'High';
          else if (priorities.length > 0) priority = 'Normal';

          const assignees = Array.from(new Set(c.tasks.map(t => t.assignedTo?.fullName).filter(Boolean)));
          const teamMembersStr = assignees.length > 0 ? assignees.slice(0, 3).join(', ') + (assignees.length > 3 ? '...' : '') : 'None';

          html += `
      <tr>
        <td><strong>${c.brandName || 'Untitled'}</strong></td>
        <td>${c.fullName}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td>${priority}</td>
        <td>${teamMembersStr}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 60px; height: 6px; background: #eef2eb; border-radius: 3px; overflow: hidden;">
              <div style="width: ${completionPct}%; height: 100%; background: #2e7d32;"></div>
            </div>
            <span>${completionPct}%</span>
          </div>
        </td>
        <td>${completedTasks} / ${totalTasks}</td>
      </tr>`;
        });

        html += `
    </tbody>
  </table>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'clients') {
      const pipelineData = await getPipelineStats(orgId);
      const clients = await prisma.client.findMany({
        where: clientWhereClause,
        include: {
          currentStep: true,
          tasks: true
        },
        orderBy: { brandName: 'asc' }
      });

      const users = await prisma.user.findMany({
        where: { organisationId: orgId }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      if (format === 'csv') {
        let csv = 'Client ID,Company Name,Contact Person,Email,Phone,Industry,Country,Time Zone,Status,Total Projects,Active Projects,Account Manager,Created At\n';
        clients.forEach(c => {
          const creator = userMap.get(c.createdById);
          const creatorName = creator?.fullName || 'System';
          const statusLabel = c.status === 'active' ? 'Active' : 'Inactive';
          const activeProj = c.status === 'active' ? 1 : 0;

          csv += `"${c.id}","${c.brandName || ''}","${c.fullName}","${c.email || ''}","${c.whatsappNumber || ''}","N/A","N/A","N/A","${statusLabel}",1,${activeProj},"${creatorName}","${c.createdAt.toISOString()}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="clients_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        const totalClients = clients.length;
        const activeClients = clients.filter(c => c.status === 'active').length;
        const inactiveClients = clients.filter(c => c.status !== 'active').length;

        const activePct = totalClients > 0 ? Math.round((activeClients / totalClients) * 100) : 0;
        const inactivePct = totalClients > 0 ? Math.round((inactiveClients / totalClients) * 100) : 0;

        let html = `<html>
<head>
  <title>Clients List Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1a2310; background-color: #fff; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #5F6F52; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #5F6F52; margin: 0 0 8px 0; }
    .header p { font-size: 14px; color: #666; margin: 0; }
    .logo-text { font-family: Georgia, serif; font-size: 24px; font-style: italic; color: #5F6F52; }
    
    .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 25px; }
    .kpi-card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 10px; padding: 15px; text-align: center; }
    .kpi-num { font-size: 26px; font-weight: 700; color: #2c3820; }
    .kpi-label { font-size: 11px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    
    .chart-container { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .segmented-bar { height: 18px; display: flex; border-radius: 9px; overflow: hidden; background: #eee; margin-bottom: 12px; }
    .segment { height: 100%; }
    .segment-active { background-color: #2e7d32; }
    .segment-inactive { background-color: #7f8c8d; }
    
    .legend-container { display: flex; gap: 20px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-active { background-color: #2e7d32; }
    .dot-inactive { background-color: #7f8c8d; }

    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eef2eb; }
    th { background-color: #f5f8f2; color: #5F6F52; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; }
    .badge-active { background: #e8f5e9; color: #2e7d32; }
    .badge-inactive { background: #eceff1; color: #37474f; }
    
    .card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; }
    .card-title { font-size: 14px; font-weight: 700; color: #5F6F52; margin: 0 0 10px 0; }
    .pipeline-section { margin-top: 30px; border-top: 1px solid #eef2eb; padding-top: 30px; page-break-inside: avoid; }
    .pipeline-section h2 { font-size: 18px; font-weight: 700; color: #5F6F52; margin: 0 0 5px 0; }
    .section-subtitle { font-size: 12px; color: #666; margin: 0 0 20px 0; }
    
    @media print {
      body { padding: 0; }
      .kpi-card, .chart-container, .card, .pipeline-section, tr { page-break-inside: avoid; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <h1>Clients Contact & Account List</h1>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="logo-text">MyC Operations</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-num">${totalClients}</div>
      <div class="kpi-label">Total Clients</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2e7d32;">${activeClients}</div>
      <div class="kpi-label">Active Accounts</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #7f8c8d;">${inactiveClients}</div>
      <div class="kpi-label">Inactive / Churned</div>
    </div>
  </div>

  <div class="chart-container">
    <div style="font-size: 13px; font-weight: 600; color: #5F6F52; margin-bottom: 8px;">Client Status Distribution</div>
    <div class="segmented-bar">
      ${activePct > 0 ? `<div class="segment segment-active" style="width: ${activePct}%" title="Active"></div>` : ''}
      ${inactivePct > 0 ? `<div class="segment segment-inactive" style="width: ${inactivePct}%" title="Inactive"></div>` : ''}
    </div>
    <div class="legend-container">
      <div class="legend-item"><span class="dot dot-active"></span> Active (${activeClients})</div>
      <div class="legend-item"><span class="dot dot-inactive"></span> Inactive (${inactiveClients})</div>
    </div>
  </div>

  <!-- Pipeline KPI & Stage Performance -->
  <div class="pipeline-section">
    <h2>Pipeline KPI & Stage Performance</h2>
    <p class="section-subtitle">Active client distribution, task statuses, and average stage durations across the pipeline</p>
    
    <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 30px; margin-bottom: 30px;">
      <!-- Active Client Distribution per Step -->
      <div class="card">
        <h3 class="card-title">Active Client Distribution per Step</h3>
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 15px;">
          ${pipelineData.stepRollup.map((step: any) => {
            const totalTasks = step.activeTasks + step.completedLast7d;
            const overdueBlocked = step.overdue + step.blocked;
            const completed = step.completedLast7d;
            const inProgress = Math.max(0, step.activeTasks - overdueBlocked);
            
            const sum = Math.max(totalTasks, 1);
            const pctCompleted = (completed / sum) * 100;
            const pctOverdue = (overdueBlocked / sum) * 100;
            const pctInProgress = (inProgress / sum) * 100;
            
            return `
              <div style="display: grid; grid-template-columns: 140px 1fr 140px; gap: 12px; align-items: center;">
                <div style="font-size: 12.5px; font-weight: 600; color: #2c3820; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                  S${step.stepNumber}. ${step.name}
                </div>
                
                <div class="segmented-bar" style="height: 14px; margin-bottom: 0; background: #eee; border-radius: 4px; overflow: hidden; display: flex;">
                  \${completed > 0 ? \`<div style="width: \${pctCompleted}%; background-color: #2e7d32; height: 100%;"></div>\` : ''}
                  \${inProgress > 0 ? \`<div style="width: \${pctInProgress}%; background-color: #5F6F52; height: 100%;"></div>\` : ''}
                  \${overdueBlocked > 0 ? \`<div style="width: \${pctOverdue}%; background-color: #c62828; height: 100%;"></div>\` : ''}
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 11.5px; color: #666;">
                  <span style="font-weight: 600; color: \${step.activeTasks > 0 ? '#1a2310' : '#888'};">\${step.activeTasks} active</span>
                  <span>\${step.averageDurationDays || 0}d avg</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
        
        <!-- Legend -->
        <div style="display: flex; gap: 15px; font-size: 11px; justify-content: center; margin-top: 15px; border-top: 1px solid #e1e8db; padding-top: 10px;">
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-active" style="background-color: #2e7d32;"></span> Done (last 7d)</div>
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-active"></span> Active</div>
          <div style="display: flex; align-items: center; gap: 4px;"><span class="dot dot-inactive" style="background-color: #c62828;"></span> Late / Blocked</div>
        </div>
      </div>

      <!-- Pipeline Performance Benchmarks -->
      <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 class="card-title">Pipeline Performance Benchmarks</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 15px;">
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #2e7d32;">${pipelineData.orgStats.onTimePct}%</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Task On-Time Rate</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #5F6F52;">${pipelineData.orgStats.avgCompletionTimeDays || 0}d</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Avg Cycle Time</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #2c3820;">${pipelineData.stepRollup.reduce((acc: number, curr: any) => acc + curr.activeTasks, 0)}</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Total Active Tasks</div>
            </div>
            
            <div style="padding: 12px; background: #f9faf7; border: 1px solid #e1e8db; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: 700; color: #c62828;">${pipelineData.orgStats.overdueTasks}</div>
              <div style="font-size: 11px; color: #666; margin-top: 4px; text-transform: uppercase;">Critical Overdue Steps</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Company/Brand Name</th>
        <th>Contact Person</th>
        <th>Email</th>
        <th>Phone</th>
        <th>Status</th>
        <th>Account Manager</th>
        <th>Joined Date</th>
      </tr>
    </thead>
    <tbody>`;

        clients.forEach(c => {
          const creator = userMap.get(c.createdById);
          const creatorName = creator?.fullName || 'System';
          const badgeClass = c.status === 'active' ? 'badge-active' : 'badge-inactive';
          html += `
      <tr>
        <td><strong>${c.brandName || '—'}</strong></td>
        <td>${c.fullName}</td>
        <td>${c.email || '—'}</td>
        <td>${c.whatsappNumber || '—'}</td>
        <td><span class="badge ${badgeClass}">${c.status.toUpperCase()}</span></td>
        <td>${creatorName}</td>
        <td>${new Date(c.dateJoined).toLocaleDateString()}</td>
      </tr>`;
        });

        html += `
    </tbody>
  </table>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'tasks') {
      const taskWhereClause: any = { organisationId: orgId };
      if (clientId) taskWhereClause.clientId = clientId;
      if (status) taskWhereClause.status = status;

      const tasks = await prisma.task.findMany({
        where: taskWhereClause,
        include: {
          client: true,
          assignedTo: true
        },
        orderBy: { dueDate: 'asc' }
      });

      if (format === 'csv') {
        let csv = 'Task ID,Task Name,Project,Assignee,Status,Priority,Estimated Hours,Logged Hours,Due Date,Created At,Completed At\n';
        tasks.forEach(t => {
          const project = t.client?.brandName || t.client?.fullName || '';
          const assignee = t.assignedTo?.fullName || '';
          const loggedHours = Math.round(t.timeSpentSeconds / 3600 * 10) / 10;
          const completedAtStr = t.completedAt ? t.completedAt.toISOString() : '';

          csv += `"${t.id}","${t.title}","${project}","${assignee}","${t.status}","${t.priority}","N/A",${loggedHours},"${t.dueDate.toISOString()}","${t.createdAt.toISOString()}","${completedAtStr}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="tasks_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        const totalTasksCount = tasks.length;
        const completeCount = tasks.filter(t => t.status === 'complete').length;
        const progressCount = tasks.filter(t => t.status === 'in_progress').length;
        const pendingCount = tasks.filter(t => t.status === 'pending').length;
        const blockedCount = tasks.filter(t => t.status === 'blocked').length;
        const overdueCount = tasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && new Date(t.dueDate) < new Date()).length;

        const completePct = totalTasksCount > 0 ? Math.round((completeCount / totalTasksCount) * 100) : 0;
        const progressPct = totalTasksCount > 0 ? Math.round((progressCount / totalTasksCount) * 100) : 0;
        const pendingPct = totalTasksCount > 0 ? Math.round((pendingCount / totalTasksCount) * 100) : 0;
        const blockedPct = totalTasksCount > 0 ? Math.round(((blockedCount + overdueCount) / totalTasksCount) * 100) : 0;

        let html = `<html>
<head>
  <title>Tasks Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1a2310; background-color: #fff; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #5F6F52; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #5F6F52; margin: 0 0 8px 0; }
    .header p { font-size: 14px; color: #666; margin: 0; }
    .logo-text { font-family: Georgia, serif; font-size: 24px; font-style: italic; color: #5F6F52; }
    
    .kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 25px; }
    .kpi-card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 10px; padding: 12px; text-align: center; }
    .kpi-num { font-size: 22px; font-weight: 700; color: #2c3820; }
    .kpi-label { font-size: 10px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    
    .chart-container { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .segmented-bar { height: 18px; display: flex; border-radius: 9px; overflow: hidden; background: #eee; margin-bottom: 12px; }
    .segment { height: 100%; }
    .segment-complete { background-color: #2e7d32; }
    .segment-progress { background-color: #2860A1; }
    .segment-pending { background-color: #cfd8dc; }
    .segment-blocked { background-color: #c62828; }
    
    .legend-container { display: flex; gap: 20px; font-size: 12px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-complete { background-color: #2e7d32; }
    .dot-progress { background-color: #2860A1; }
    .dot-pending { background-color: #cfd8dc; }
    .dot-blocked { background-color: #c62828; }

    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eef2eb; }
    th { background-color: #f5f8f2; color: #5F6F52; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
    .badge-complete { background: #e8f5e9; color: #2e7d32; }
    .badge-pending { background: #fff8e1; color: #f57f17; }
    .badge-progress { background: #e3f2fd; color: #1565c0; }
    .badge-blocked { background: #f3e5f5; color: #6b3fa0; }
    .badge-overdue { background: #ffebee; color: #c62828; }
    
    @media print {
      body { padding: 0; }
      .kpi-card, .chart-container, tr { page-break-inside: avoid; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <h1>Tasks Assignment & Status Report</h1>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="logo-text">MyC Operations</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-num">${totalTasksCount}</div>
      <div class="kpi-label">Total Tasks</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2e7d32;">${completeCount}</div>
      <div class="kpi-label">Completed</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2860A1;">${progressCount}</div>
      <div class="kpi-label">In Progress</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #f57f17;">${pendingCount}</div>
      <div class="kpi-label">Pending</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #c62828;">${blockedCount + overdueCount}</div>
      <div class="kpi-label">Blocked/Overdue</div>
    </div>
  </div>

  <div class="chart-container">
    <div style="font-size: 13px; font-weight: 600; color: #5F6F52; margin-bottom: 8px;">Task Status Distribution</div>
    <div class="segmented-bar">
      ${completePct > 0 ? `<div class="segment segment-complete" style="width: ${completePct}%" title="Complete"></div>` : ''}
      ${progressPct > 0 ? `<div class="segment segment-progress" style="width: ${progressPct}%" title="In Progress"></div>` : ''}
      ${pendingPct > 0 ? `<div class="segment segment-pending" style="width: ${pendingPct}%" title="Pending"></div>` : ''}
      ${blockedPct > 0 ? `<div class="segment segment-blocked" style="width: ${blockedPct}%" title="Blocked/Overdue"></div>` : ''}
    </div>
    <div class="legend-container">
      <div class="legend-item"><span class="dot dot-complete"></span> Completed (${completeCount})</div>
      <div class="legend-item"><span class="dot dot-progress"></span> In Progress (${progressCount})</div>
      <div class="legend-item"><span class="dot dot-pending"></span> Pending (${pendingCount})</div>
      <div class="legend-item"><span class="dot dot-blocked"></span> Blocked/Overdue (${blockedCount + overdueCount})</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Task Title</th>
        <th>Project/Client</th>
        <th>Assignee</th>
        <th>Status</th>
        <th>Priority</th>
        <th>Logged Time</th>
        <th>Due Date</th>
      </tr>
    </thead>
    <tbody>`;

        tasks.forEach(t => {
          const project = t.client?.brandName || t.client?.fullName || '—';
          const assignee = t.assignedTo?.fullName || 'Unassigned';
          const loggedHours = Math.round(t.timeSpentSeconds / 3600 * 10) / 10;
          
          let badgeClass = 'badge-pending';
          let statusLabel = t.status.toUpperCase();
          if (t.status === 'complete') badgeClass = 'badge-complete';
          else if (t.status === 'in_progress' as any) badgeClass = 'badge-progress';
          else if (t.status === 'blocked' as any) badgeClass = 'badge-blocked';
          else if ((t.status as string) !== 'complete' && (t.status as string) !== 'cancelled' && (t.status as string) !== 'rejected' && new Date(t.dueDate) < new Date()) {
            badgeClass = 'badge-overdue';
            statusLabel = 'OVERDUE';
          }

          html += `
      <tr>
        <td><strong>${t.title}</strong></td>
        <td>${project}</td>
        <td>${assignee}</td>
        <td><span class="badge ${badgeClass}">${statusLabel}</span></td>
        <td><span style="text-transform: uppercase; font-weight: 600; font-size: 11px;">${t.priority}</span></td>
        <td>${loggedHours} hrs</td>
        <td>${new Date(t.dueDate).toLocaleDateString()}</td>
      </tr>`;
        });

        html += `
    </tbody>
  </table>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'users') {
      const users = await prisma.user.findMany({
        where: { organisationId: orgId },
        include: {
          assignedTasks: {
            include: { client: true }
          }
        },
        orderBy: { fullName: 'asc' }
      });

      if (format === 'csv') {
        let csv = 'Employee ID,Name,Email,Role,Department,Phone,Joined Date,Assigned Projects,Active Tasks,Status\n';
        users.forEach(u => {
          const activeTasksCount = u.assignedTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled').length;
          const assignedClients = Array.from(new Set(u.assignedTasks.map(t => t.clientId)));
          const activeProjectsCount = assignedClients.length;
          const statusLabel = u.isActive ? 'Active' : 'Inactive';

          csv += `"${u.id}","${u.fullName}","${u.email}","${u.role}","${u.teamName || 'N/A'}","${u.whatsappNumber || ''}","${u.createdAt.toISOString()}",${activeProjectsCount},${activeTasksCount},"${statusLabel}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="employees_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        const totalCount = users.length;
        const activeCount = users.filter(u => u.isActive).length;
        const adminCount = users.filter(u => u.role === 'admin').length;
        const leaderCount = users.filter(u => u.role === 'team_leader').length;
        const memberCount = users.filter(u => u.role === 'team_member').length;

        const adminPct = totalCount > 0 ? Math.round((adminCount / totalCount) * 100) : 0;
        const leaderPct = totalCount > 0 ? Math.round((leaderCount / totalCount) * 100) : 0;
        const memberPct = totalCount > 0 ? Math.round((memberCount / totalCount) * 100) : 0;

        let html = `<html>
<head>
  <title>Employees List Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    body { font-family: 'Outfit', sans-serif; padding: 40px; color: #1a2310; background-color: #fff; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #5F6F52; padding-bottom: 20px; margin-bottom: 30px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #5F6F52; margin: 0 0 8px 0; }
    .header p { font-size: 14px; color: #666; margin: 0; }
    .logo-text { font-family: Georgia, serif; font-size: 24px; font-style: italic; color: #5F6F52; }
    
    .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; }
    .kpi-card { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 10px; padding: 15px; text-align: center; }
    .kpi-num { font-size: 26px; font-weight: 700; color: #2c3820; }
    .kpi-label { font-size: 11px; font-weight: 500; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    
    .chart-container { background: #fcfdfb; border: 1px solid #e1e8db; border-radius: 12px; padding: 20px; margin-bottom: 30px; }
    .segmented-bar { height: 18px; display: flex; border-radius: 9px; overflow: hidden; background: #eee; margin-bottom: 12px; }
    .segment { height: 100%; }
    .segment-admin { background-color: #2c3820; }
    .segment-leader { background-color: #2860A1; }
    .segment-member { background-color: #5F6F52; }
    
    .legend-container { display: flex; gap: 20px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot-admin { background-color: #2c3820; }
    .dot-leader { background-color: #2860A1; }
    .dot-member { background-color: #5F6F52; }

    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { padding: 12px 14px; text-align: left; font-size: 13px; border-bottom: 1px solid #eef2eb; }
    th { background-color: #f5f8f2; color: #5F6F52; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 600; }
    .badge-active { background: #e8f5e9; color: #2e7d32; }
    .badge-inactive { background: #eceff1; color: #37474f; }
    
    @media print {
      body { padding: 0; }
      .kpi-card, .chart-container, tr { page-break-inside: avoid; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <h1>Employees Roster & Workload Summary</h1>
      <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
    <div class="logo-text">MyC Operations</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-num">${totalCount}</div>
      <div class="kpi-label">Total Staff</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2e7d32;">${activeCount}</div>
      <div class="kpi-label">Active Roster</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2860A1;">${leaderCount}</div>
      <div class="kpi-label">Team Leaders</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #5F6F52;">${memberCount}</div>
      <div class="kpi-label">Team Members</div>
    </div>
  </div>

  <div class="chart-container">
    <div style="font-size: 13px; font-weight: 600; color: #5F6F52; margin-bottom: 8px;">Role Distribution Breakdown</div>
    <div class="segmented-bar">
      ${adminPct > 0 ? `<div class="segment segment-admin" style="width: ${adminPct}%" title="Admins"></div>` : ''}
      ${leaderPct > 0 ? `<div class="segment segment-leader" style="width: ${leaderPct}%" title="Team Leaders"></div>` : ''}
      ${memberPct > 0 ? `<div class="segment segment-member" style="width: ${memberPct}%" title="Team Members"></div>` : ''}
    </div>
    <div class="legend-container">
      <div class="legend-item"><span class="dot dot-admin"></span> Admins (${adminCount})</div>
      <div class="legend-item"><span class="dot dot-leader"></span> Team Leaders (${leaderCount})</div>
      <div class="legend-item"><span class="dot dot-member"></span> Team Members (${memberCount})</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Employee Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Department/Team</th>
        <th>Active Projects</th>
        <th>Active Tasks</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>`;

        users.forEach(u => {
          const activeTasksCount = u.assignedTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled').length;
          const assignedClients = Array.from(new Set(u.assignedTasks.map(t => t.clientId)));
          const activeProjectsCount = assignedClients.length;
          const badgeClass = u.isActive ? 'badge-active' : 'badge-inactive';
          
          html += `
      <tr>
        <td><strong>${u.fullName}</strong></td>
        <td>${u.email}</td>
        <td style="text-transform: capitalize;">${u.role.replace('_', ' ')}</td>
        <td>${u.teamName || '—'}</td>
        <td>${activeProjectsCount}</td>
        <td>${activeTasksCount}</td>
        <td><span class="badge ${badgeClass}">${u.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
      </tr>`;
        });

        html += `
    </tbody>
  </table>
</body>
</html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'clients' || type === 'client_full') {
      const clients = await prisma.client.findMany({
        where: clientWhereClause,
        include: {
          currentStep: true,
          stepHistory: {
            include: { toStep: true }
          },
          tasks: {
            include: {
              assignedTo: true,
              step: true,
              documents: true,
            },
            orderBy: { dueDate: 'asc' }
          },
        },
        orderBy: { brandName: 'asc' },
      }) as any;

      const orgSteps = await prisma.step.findMany({
        where: { organisationId: orgId },
        orderBy: { stepNumber: 'asc' }
      });

      let filteredClients: any[] = clients;
      if (startDate && endDate) {
        filteredClients = clients.filter((c: any) => c.createdAt >= startDate && c.createdAt <= endDate);
      }

      if (format === 'csv') {
        let csv = '';
        if (type === 'clients') {
          csv = 'ID,Full Name,Brand Name,Email,Phone,Status,Onboarded At,Current Step Number,Current Step Name,Created At\n';
          filteredClients.forEach((c: any) => {
            csv += `"${c.id}","${c.fullName || ''}","${c.brandName || ''}","${c.email || ''}","${c.whatsappNumber || ''}","${c.status}","${c.dateJoined.toISOString()}","${c.currentStep?.stepNumber || ''}","${c.currentStep?.name || ''}","${c.createdAt.toISOString()}"\n`;
          });
        } else if (clientId && filteredClients.length > 0) {
          const client = filteredClients[0];
          csv = 'Task ID,Title,Description,Step Number,Step Name,Assignee Name,Team Name,Priority,Due Date,Status,Completed At,Blocker Note,Rejection Note,Proof Link,Proof Description\n';
          (client.tasks || []).forEach((t: any) => {
            const assigneeName = t.assignedTo?.fullName || '';
            const teamName = t.assignedTo?.teamName || '';
            const stepNumber = t.step?.stepNumber || '';
            const stepName = t.step?.name || '';
            const doc = t.documents && t.documents[0];
            const proofLink = doc?.driveUrl || doc?.fileUrl || '';
            const proofDesc = doc?.description || doc?.notes || '';
            csv += `"${t.id}","${(t.title || '').replace(/"/g, '""')}","${(t.description || '').replace(/"/g, '""')}","${stepNumber}","${(stepName || '').replace(/"/g, '""')}","${(assigneeName || '').replace(/"/g, '""')}","${(teamName || '').replace(/"/g, '""')}","${t.priority}","${t.dueDate ? new Date(t.dueDate).toISOString() : ''}","${t.status}","${t.completedAt ? new Date(t.completedAt).toISOString() : ''}","${(t.blockerNote || '').replace(/"/g, '""')}","${(t.rejectionNote || '').replace(/"/g, '""')}","${(proofLink || '').replace(/"/g, '""')}","${(proofDesc || '').replace(/"/g, '""')}"\n`;
          });
        } else {
          csv = 'Client ID,Brand Name,Full Name,Email,Status,Current Step,Total Tasks,Completed Tasks,Pending Tasks,Overdue Tasks\n';
          filteredClients.forEach((c: any) => {
            const total = c.tasks.length;
            const done = c.tasks.filter((t: any) => t.status === 'complete').length;
            const pending = c.tasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress').length;
            const overdue = c.tasks.filter((t: any) => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
            csv += `"${c.id}","${c.brandName || ''}","${c.fullName || ''}","${c.email || ''}","${c.status}","Step ${c.currentStep?.stepNumber || ''}: ${c.currentStep?.name || ''}",${total},${done},${pending},${overdue}\n`;
          });
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        if (clientId && filteredClients.length > 0) {
          const client = filteredClients[0];
          const total = client.tasks.length;
          const done = client.tasks.filter((t: any) => t.status === 'complete').length;
          const pending = client.tasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress').length;
          const overdue = client.tasks.filter((t: any) => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && new Date(t.dueDate) < new Date()).length;
          const blocked = client.tasks.filter((t: any) => t.status === 'blocked').length;

          // Compute durations per step for client using history transitions
          const historyLogs = [...(client.stepHistory || [])].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

          const stepDurations = orgSteps.map(step => {
            let totalMs = 0;

            historyLogs.forEach((log: any, idx: number) => {
              if (log.toStepId === step.id) {
                const start = new Date(log.createdAt).getTime();
                const nextLog = historyLogs[idx + 1];
                const end = nextLog ? new Date(nextLog.createdAt).getTime() : new Date().getTime();
                totalMs += Math.max(0, end - start);
              }
            });

            // Fallback: if it's the client's current step and we don't have transition logs
            if (client.currentStepId === step.id && totalMs === 0) {
              const start = new Date(client.stepEnteredAt || client.createdAt).getTime();
              totalMs = Math.max(0, new Date().getTime() - start);
            }

            let durationText = '—';
            let durationDays = 0;
            if (totalMs > 0) {
              durationDays = totalMs / (1000 * 60 * 60 * 24);
              if (durationDays < 0.1) {
                durationText = (Math.round(durationDays * 24 * 10) / 10) + ' hrs';
              } else {
                durationText = (Math.round(durationDays * 10) / 10) + ' days';
              }
            }

            let statusClass = 'pending';
            let statusLabel = 'Pending';
            if (client.currentStep && step.stepNumber < client.currentStep.stepNumber) {
              statusClass = 'completed';
              statusLabel = 'Completed';
            } else if (client.currentStepId === step.id) {
              statusClass = 'active';
              statusLabel = 'Active';
            }

            return {
              step,
              durationText,
              durationDays,
              statusClass,
              statusLabel
            };
          });

          let html = `<html>
<head>
  <title>Client Full Report: ${client.brandName || client.fullName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
    body {
      font-family: 'Outfit', sans-serif;
      padding: 40px;
      color: #1a2310;
      background-color: #fff;
      margin: 0;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #5F6F52;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      color: #5F6F52;
      margin: 0 0 8px 0;
    }
    .header p {
      font-size: 14px;
      color: #555;
      margin: 0;
    }
    .logo-text {
      font-family: Georgia, serif;
      font-size: 26px;
      font-style: italic;
      color: #5F6F52;
    }
    .dossier-grid {
      display: grid;
      grid-template-columns: 1.5fr 1fr;
      gap: 30px;
      margin-bottom: 35px;
    }
    .card {
      background: #fcfdfb;
      border: 1px solid #e1e8db;
      border-radius: 12px;
      padding: 20px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 600;
      color: #5F6F52;
      margin-top: 0;
      margin-bottom: 15px;
      border-bottom: 1px solid #e1e8db;
      padding-bottom: 8px;
    }
    .meta-row {
      display: flex;
      margin-bottom: 10px;
      font-size: 14px;
    }
    .meta-label {
      width: 130px;
      font-weight: 600;
      color: #666;
    }
    .meta-value {
      color: #1a2310;
      flex: 1;
    }
    .kpi-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 35px;
    }
    .kpi-card {
      background: #f9faf7;
      border: 1px solid #e1e8db;
      border-radius: 10px;
      padding: 15px;
      text-align: center;
    }
    .kpi-num {
      font-size: 26px;
      font-weight: 700;
      color: #2c3820;
    }
    .kpi-label {
      font-size: 12px;
      font-weight: 500;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 4px;
    }
    .table-container {
      margin-top: 25px;
    }
    .table-container h3 {
      font-size: 18px;
      color: #2c3820;
      margin-bottom: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      font-size: 13.5px;
      border-bottom: 1px solid #eef2eb;
    }
    th {
      background-color: #f5f8f2;
      color: #5F6F52;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.5px;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-complete { background: #e8f5e9; color: #2e7d32; }
    .status-pending { background: #fff8e1; color: #f57f17; }
    .status-in_progress { background: #e3f2fd; color: #1565c0; }
    .status-blocked { background: #f3e5f5; color: #6b3fa0; }
    .status-overdue { background: #ffebee; color: #c62828; }
    .status-rejected { background: #efebe9; color: #4e342e; }
    .status-cancelled { background: #eceff1; color: #37474f; }
    
    .proof-box {
      font-size: 12px;
      background: #f4f7f1;
      border-left: 3px solid #5F6F52;
      padding: 6px 10px;
      margin-top: 5px;
      border-radius: 0 4px 4px 0;
    }
    .proof-box a {
      color: #5F6F52;
      text-decoration: underline;
      font-weight: 500;
    }
    
    .timeline-container {
      background: #fcfdfb;
      border: 1px solid #e1e8db;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .timeline {
      position: relative;
      border-left: 2px solid #e1e8db;
      padding-left: 20px;
      margin-left: 10px;
      margin-top: 15px;
    }
    .timeline-item {
      position: relative;
      margin-bottom: 20px;
    }
    .timeline-item::before {
      content: '';
      position: absolute;
      left: -27px;
      top: 4px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #fff;
      border: 2px solid #e1e8db;
    }
    .timeline-item.completed::before {
      background: #2e7d32;
      border-color: #2e7d32;
    }
    .timeline-item.active::before {
      background: #2860A1;
      border-color: #2860A1;
      box-shadow: 0 0 0 4px rgba(40, 96, 161, 0.2);
    }
    .timeline-item.pending::before {
      background: #fff;
      border-color: #ccc;
    }
    .timeline-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      margin-bottom: 4px;
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .timeline-badge.badge-completed {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .timeline-badge.badge-active {
      background: #e3f2fd;
      color: #1565c0;
    }
    .timeline-badge.badge-pending {
      background: #eceff1;
      color: #37474f;
    }
    .timeline-title {
      font-size: 14px;
      font-weight: 600;
      color: #2c3820;
    }
    .timeline-time {
      font-size: 12px;
      color: #666;
      margin-top: 2px;
    }
    
    @media print {
      body { padding: 0; }
      .card, .kpi-card, .timeline-container { page-break-inside: avoid; }
      tr { page-break-inside: avoid; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body onload="window.print()">
  <div class="header">
    <div>
      <h1>Client Onboarding & Progress Report</h1>
      <p>Official status summary for ${client.brandName || client.fullName}</p>
    </div>
    <div class="logo-text">MyC Operations</div>
  </div>

  <div class="dossier-grid">
    <div class="card">
      <h3 class="card-title">Client Details</h3>
      <div class="meta-row">
        <div class="meta-label">Brand Name:</div>
        <div class="meta-value"><strong>${client.brandName || '—'}</strong></div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Primary Contact:</div>
        <div class="meta-value">${client.fullName}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Email Address:</div>
        <div class="meta-value">${client.email || '—'}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">WhatsApp/Phone:</div>
        <div class="meta-value">${client.whatsappNumber || '—'}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Account Status:</div>
        <div class="meta-value"><span style="text-transform: capitalize; font-weight: 600;">${client.status}</span></div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">Pipeline Tracking</h3>
      <div class="meta-row">
        <div class="meta-label">Current Pipeline:</div>
        <div class="meta-value">Step ${client.currentStep?.stepNumber || '—'}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Step Name:</div>
        <div class="meta-value"><strong>${client.currentStep?.name || '—'}</strong></div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Owning Team:</div>
        <div class="meta-value">${client.currentStep?.owningTeamName || '—'}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Joined Date:</div>
        <div class="meta-value">${new Date(client.dateJoined).toLocaleDateString()}</div>
      </div>
      <div class="meta-row">
        <div class="meta-label">Report Date:</div>
        <div class="meta-value">${new Date().toLocaleDateString()}</div>
      </div>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-num">${total}</div>
      <div class="kpi-label">Total Tasks</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #2e7d32;">${done}</div>
      <div class="kpi-label">Completed</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #c62828;">${overdue}</div>
      <div class="kpi-label">Overdue</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-num" style="color: #6b3fa0;">${blocked}</div>
      <div class="kpi-label">Blocked</div>
    </div>
  </div>

  <div class="timeline-container">
    <h3 style="margin-top: 0; color: #2c3820; font-size: 16px; border-bottom: 1px solid #e1e8db; padding-bottom: 8px;">Pipeline Stage Durations</h3>
    <div class="timeline">
      ${stepDurations.map((sd: any) => `
        <div class="timeline-item ${sd.statusClass}">
          <span class="timeline-badge badge-${sd.statusClass}">${sd.statusLabel}</span>
          <div class="timeline-title">Step ${sd.step.stepNumber}: ${sd.step.name}</div>
          <div class="timeline-time">Duration: <strong>${sd.durationText}</strong></div>
        </div>
      `).join('')}
    </div>
  </div>

  <div class="table-container">
    <h3>Detailed Pipeline Tasks</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 80px;">Step</th>
          <th>Task Title</th>
          <th style="width: 140px;">Assignee</th>
          <th style="width: 110px;">Due Date</th>
          <th style="width: 120px;">Status</th>
        </tr>
      </thead>
      <tbody>
`;

          (client.tasks || []).forEach((t: any) => {
            const stepNum = t.step?.stepNumber || '';
            const stepName = t.step?.name || '';
            const assigneeName = t.assignedTo?.fullName || '—';
            const teamName = t.assignedTo?.teamName || '';
            const dueStr = t.dueDate ? new Date(t.dueDate).toLocaleDateString() : '—';
            
            let badgeClass = 'status-pending';
            if (t.status === 'complete') badgeClass = 'status-complete';
            else if (t.status === 'in_progress') badgeClass = 'status-in_progress';
            else if (t.status === 'blocked') badgeClass = 'status-blocked';
            else if (t.status === 'rejected') badgeClass = 'status-rejected';
            else if (t.status === 'cancelled') badgeClass = 'status-cancelled';
            else if (t.status !== 'complete' && t.dueDate && new Date(t.dueDate) < new Date()) badgeClass = 'status-overdue';

            let statusLabel = t.status.replace('_', ' ');
            if (badgeClass === 'status-overdue') statusLabel = 'overdue';

            const doc = t.documents && t.documents[0];
            const proofUrl = doc?.driveUrl || doc?.fileUrl;
            const proofNotes = doc?.description || doc?.notes;

            html += `
        <tr>
          <td><strong>Step ${stepNum}</strong></td>
          <td>
            <div style="font-weight: 600; color: #2c3820;">${t.title}</div>
            ${t.description ? `<div style="font-size: 12px; color: #555; margin-top: 3px;">${t.description}</div>` : ''}
            ${t.blockerNote ? `<div style="font-size: 12px; color: #6b3fa0; margin-top: 3px; font-weight: 500;">Blocker: "${t.blockerNote}"</div>` : ''}
            ${t.rejectionNote ? `<div style="font-size: 12px; color: #c62828; margin-top: 3px; font-weight: 500;">Rejection: "${t.rejectionNote}"</div>` : ''}
            ${proofUrl ? `
              <div class="proof-box">
                <strong>Vault Deliverable:</strong> <a href="${proofUrl}" target="_blank">${proofUrl}</a>
                ${proofNotes ? `<div style="color: #666; margin-top: 2px;">${proofNotes}</div>` : ''}
              </div>
            ` : ''}
          </td>
          <td>
            <div>${assigneeName}</div>
            ${teamName ? `<div style="font-size: 11px; color: #666;">${teamName}</div>` : ''}
          </td>
          <td>${dueStr}</td>
          <td>
            <span class="status-badge ${badgeClass}">${statusLabel}</span>
          </td>
        </tr>
`;
          });

          html += `
      </tbody>
    </table>
  </div>
</body>
</html>`;
          res.setHeader('Content-Type', 'text/html');
          res.send(html);
          return;
        }

        let html = `<html><head><title>Client Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; }
          h2 { margin-bottom: 5px; }
          p { margin-top: 5px; color: #666; font-size: 13px; }
        </style></head><body onload="window.print()">
          <h2>MyC Ops - ${type === 'clients' ? 'Clients' : 'Client Full'} Report</h2>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Brand/Client Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Current Step</th>
                <th>Tasks (Total)</th>
                <th>Done</th>
                <th>Pending</th>
                <th>Overdue</th>
              </tr>
            </thead>
            <tbody>
        `;
        filteredClients.forEach((c: any) => {
          const total = c.tasks.length;
          const done = c.tasks.filter((t: any) => t.status === 'complete').length;
          const pending = c.tasks.filter((t: any) => t.status === 'pending' || t.status === 'in_progress').length;
          const overdue = c.tasks.filter((t: any) => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
          html += `
            <tr>
              <td><strong>${c.brandName || ''}</strong><br/>${c.fullName || ''}</td>
              <td>${c.email || ''}</td>
              <td>${c.status.toUpperCase()}</td>
              <td>Step ${c.currentStep?.stepNumber || ''}: ${c.currentStep?.name || ''}</td>
              <td>${total}</td>
              <td>${done}</td>
              <td>${pending}</td>
              <td>${overdue}</td>
            </tr>
          `;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'users') {
      const users = await prisma.user.findMany({
        where: { organisationId: orgId },
        orderBy: { fullName: 'asc' },
      });
      if (format === 'csv') {
        let csv = 'ID,Full Name,Email,Role,Team Name,Active,Created At\n';
        users.forEach(u => {
          csv += `"${u.id}","${u.fullName}","${u.email}","${u.role}","${u.teamName || ''}",${u.isActive},"${u.createdAt.toISOString()}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="users_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        let html = `<html><head><title>Users Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; }
        </style></head><body onload="window.print()">
          <h2>Users Report</h2>
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th></tr></thead>
            <tbody>`;
        users.forEach(u => {
          html += `<tr><td>${u.fullName}</td><td>${u.email}</td><td>${u.role}</td><td>${u.teamName || '—'}</td><td>${u.isActive ? 'Active' : 'Inactive'}</td></tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'teams' || type === 'team_performance') {
      const teams = await prisma.team.findMany({
        where: { organisationId: orgId },
        orderBy: { name: 'asc' },
      });
      const tasks = await prisma.task.findMany({
        where: { organisationId: orgId },
        include: { step: true, assignedTo: true },
      });

      if (format === 'csv') {
        let csv = '';
        if (type === 'teams') {
          csv = 'ID,Name,Created At\n';
          teams.forEach(t => {
            csv += `"${t.id}","${t.name}","${t.createdAt.toISOString()}"\n`;
          });
        } else {
          csv = 'Team Name,Total Tasks,Completed Tasks,Pending Tasks,Overdue Tasks,On-Time Completion Rate (%)\n';
          const teamNames = Array.from(new Set([
            ...teams.map(t => t.name),
            ...tasks.map(t => t.step?.owningTeamName).filter(Boolean) as string[],
            ...tasks.map(t => t.assignedTo?.teamName).filter(Boolean) as string[]
          ]));
          teamNames.forEach(tName => {
            const teamTasks = tasks.filter(t => t.step?.owningTeamName === tName || t.assignedTo?.teamName === tName);
            const total = teamTasks.length;
            const done = teamTasks.filter(t => t.status === 'complete').length;
            const pending = teamTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
            const overdue = teamTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
            const onTime = total > 0 ? Math.round((done / total) * 100) : 100;
            csv += `"${tName}",${total},${done},${pending},${overdue},${onTime}%\n`;
          });
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}_report_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        let html = `<html><head><title>Team Performance Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; }
        </style></head><body onload="window.print()">
          <h2>Team Performance Report</h2>
          <table>
            <thead><tr><th>Team Name</th><th>Total Tasks</th><th>Completed</th><th>Pending</th><th>Overdue</th><th>On-Time Rate</th></tr></thead>
            <tbody>`;
        const teamNames = Array.from(new Set([
          ...teams.map(t => t.name),
          ...tasks.map(t => t.step?.owningTeamName).filter(Boolean) as string[],
          ...tasks.map(t => t.assignedTo?.teamName).filter(Boolean) as string[]
        ]));
        teamNames.forEach(tName => {
          const teamTasks = tasks.filter(t => t.step?.owningTeamName === tName || t.assignedTo?.teamName === tName);
          const total = teamTasks.length;
          const done = teamTasks.filter(t => t.status === 'complete').length;
          const pending = teamTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
          const overdue = teamTasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
          const onTime = total > 0 ? Math.round((done / total) * 100) : 100;
          html += `<tr><td>${tName}</td><td>${total}</td><td>${done}</td><td>${pending}</td><td>${overdue}</td><td>${onTime}%</td></tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'tasks') {
      const taskWhereClause: any = { organisationId: orgId };
      
      if (clientId) taskWhereClause.clientId = clientId;
      if (stepId) taskWhereClause.stepId = stepId;
      if (status) taskWhereClause.status = status;
      if (priority) taskWhereClause.priority = priority;
      if (assignedToId) taskWhereClause.assignedToId = assignedToId;
      
      if (completed === 'true') {
        taskWhereClause.status = 'complete';
      } else if (completed === 'false') {
        taskWhereClause.status = { not: 'complete' };
      }

      if (team) {
        taskWhereClause.step = { owningTeamName: team };
      }

      const tasks = await prisma.task.findMany({
        where: taskWhereClause,
        include: {
          client: true,
          step: true,
          assignedTo: true,
        },
        orderBy: { dueDate: 'asc' },
      });

      let filteredTasks = tasks;
      if (startDate && endDate) {
        filteredTasks = tasks.filter(t => t.dueDate >= startDate && t.dueDate <= endDate);
      }

      if (!includeArchived) {
        filteredTasks = filteredTasks.filter(t => t.client?.status !== 'churned');
      }

      if (format === 'csv') {
        let csv = 'ID,Title,Description,Status,Priority,Due Date,Completed At,Client Name,Step,Assignee,Assignee Team,Rejection Note\n';
        filteredTasks.forEach(t => {
          csv += `"${t.id}","${t.title}","${t.description || ''}","${t.status}","${t.priority}","${t.dueDate.toISOString()}","${t.completedAt ? t.completedAt.toISOString() : ''}","${t.client?.brandName || t.client?.fullName || ''}","Step ${t.step?.stepNumber || ''}: ${t.step?.name || ''}","${t.assignedTo?.fullName || ''}","${t.assignedTo?.teamName || ''}","${t.rejectionNote || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="tasks_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        let html = `<html><head><title>Tasks Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; }
          th { background-color: #f5f5f5; }
        </style></head><body onload="window.print()">
          <h2>Tasks Report</h2>
          <table>
            <thead><tr><th>Title</th><th>Client</th><th>Step</th><th>Assignee</th><th>Status</th><th>Priority</th><th>Due Date</th></tr></thead>
            <tbody>`;
        filteredTasks.forEach(t => {
          html += `<tr>
            <td><strong>${t.title}</strong><br/>${t.description || ''}</td>
            <td>${t.client?.brandName || t.client?.fullName || ''}</td>
            <td>Step ${t.step?.stepNumber || ''}: ${t.step?.name || ''}</td>
            <td>${t.assignedTo?.fullName || ''} (${t.assignedTo?.teamName || '—'})</td>
            <td>${t.status.toUpperCase()}</td>
            <td>${t.priority.toUpperCase()}</td>
            <td>${t.dueDate.toLocaleDateString()}</td>
          </tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'templates') {
      const templates = await prisma.stepTaskTemplate.findMany({
        where: { organisationId: orgId },
        include: { step: true },
        orderBy: [{ step: { stepNumber: 'asc' } }, { sortOrder: 'asc' }],
      });
      if (format === 'csv') {
        let csv = 'ID,Title,Description,Relative Due Day,Priority,Sort Order,Step Number,Step Name\n';
        templates.forEach(t => {
          csv += `"${t.id}","${t.title}","${t.description || ''}",${t.relativeDueDay},"${t.priority}",${t.sortOrder},${t.step?.stepNumber || ''},"${t.step?.name || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="templates_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        let html = `<html><head><title>Templates Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; }
        </style></head><body onload="window.print()">
          <h2>Task Templates Report</h2>
          <table>
            <thead><tr><th>Step</th><th>Title</th><th>Description</th><th>Relative Due Day</th><th>Priority</th></tr></thead>
            <tbody>`;
        templates.forEach(t => {
          html += `<tr><td>Step ${t.step?.stepNumber || ''}: ${t.step?.name || ''}</td><td>${t.title}</td><td>${t.description || ''}</td><td>Day ${t.relativeDueDay}</td><td>${t.priority}</td></tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    if (type === 'steps') {
      const steps = await prisma.step.findMany({
        where: { organisationId: orgId },
        orderBy: { stepNumber: 'asc' },
      });
      if (format === 'csv') {
        let csv = 'ID,Step Number,Name,Owning Team,SLA Days,Description,Active\n';
        steps.forEach(s => {
          csv += `"${s.id}",${s.stepNumber},"${s.name}","${s.owningTeamName}",${s.slaDays},"${s.description || ''}",${s.isActive}\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="steps_export_${Date.now()}.csv"`);
        res.send(csv);
        return;
      } else {
        let html = `<html><head><title>Steps Report</title><style>
          body { font-family: sans-serif; padding: 20px; color: #333; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; }
        </style></head><body onload="window.print()">
          <h2>Steps Report</h2>
          <table>
            <thead><tr><th>Number</th><th>Name</th><th>Owning Team</th><th>SLA Days</th><th>Description</th></tr></thead>
            <tbody>`;
        steps.forEach(s => {
          html += `<tr><td>Step ${s.stepNumber}</td><td>${s.name}</td><td>${s.owningTeamName}</td><td>${s.slaDays} days</td><td>${s.description || ''}</td></tr>`;
        });
        html += `</tbody></table></body></html>`;
        res.setHeader('Content-Type', 'text/html');
        res.send(html);
        return;
      }
    }

    res.status(400).json({ error: 'Invalid export type' });
  } catch (err: any) {
    console.error('Export error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
