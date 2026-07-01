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

    if (type === 'clients' || type === 'client_full') {
      const clients = await prisma.client.findMany({
        where: clientWhereClause,
        include: {
          currentStep: true,
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
      });

      let filteredClients = clients;
      if (startDate && endDate) {
        filteredClients = clients.filter(c => c.createdAt >= startDate && c.createdAt <= endDate);
      }

      if (format === 'csv') {
        let csv = '';
        if (type === 'clients') {
          csv = 'ID,Full Name,Brand Name,Email,Phone,Status,Onboarded At,Current Step Number,Current Step Name,Created At\n';
          filteredClients.forEach(c => {
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
          filteredClients.forEach(c => {
            const total = c.tasks.length;
            const done = c.tasks.filter(t => t.status === 'complete').length;
            const pending = c.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
            const overdue = c.tasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
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
    
    @media print {
      body { padding: 0; }
      .card, .kpi-card { page-break-inside: avoid; }
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
        filteredClients.forEach(c => {
          const total = c.tasks.length;
          const done = c.tasks.filter(t => t.status === 'complete').length;
          const pending = c.tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
          const overdue = c.tasks.filter(t => t.status !== 'complete' && t.status !== 'cancelled' && t.status !== 'rejected' && t.dueDate < new Date()).length;
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
