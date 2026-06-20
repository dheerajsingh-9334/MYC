import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { notifyClientStatusChanged } from '../services/notify.service';
import { computeClientStatus, advanceClientToStep, handleManualStepMove } from '../services/pipeline.service';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// GET /api/clients
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;

    // Build scoped WHERE clause by role
    let where: any = { organisationId: orgId };

    if (role === 'team_leader' && teamName) {
      // Team leader sees only clients currently in their team's step
      const teamSteps = await prisma.step.findMany({
        where: { organisationId: orgId, owningTeamName: teamName },
        select: { id: true },
      });
      where.currentStepId = { in: teamSteps.map((s) => s.id) };
    } else if (role === 'team_member') {
      // Team member sees clients they have at least one task for
      const myClientIds = await prisma.task
        .findMany({ where: { assignedToId: userId, organisationId: orgId }, select: { clientId: true }, distinct: ['clientId'] })
        .then((rows) => rows.map((r) => r.clientId));
      where.id = { in: myClientIds };
    }
    // admin: no extra filter

    const clients = await prisma.client.findMany({
      where,
      include: { currentStep: true, tasks: true },
      orderBy: { createdAt: 'desc' },
    });

    const result = clients.map((c) => {
      const status = computeClientStatus(c.tasks);
      const daysInStep = Math.floor(
        (Date.now() - new Date(c.stepEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: c.id,
        fullName: c.fullName,
        brandName: c.brandName,
        email: c.email,
        status: c.status,
        computedStatus: status,
        currentStep: c.currentStep,
        stepEnteredAt: c.stepEnteredAt,
        daysInStep,
        dateJoined: c.dateJoined,
        taskCount: c.tasks.length,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        currentStep: true,
        tasks: {
          include: { assignedTo: true },
          orderBy: { dueDate: 'asc' },
        },
        stepHistory: {
          include: { fromStep: true, toStep: true, triggeredByUser: true },
          orderBy: { createdAt: 'desc' },
        },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const computedStatus = computeClientStatus(client.tasks);
    const daysInStep = Math.floor(
      (Date.now() - new Date(client.stepEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    res.json({ ...client, computedStatus, daysInStep });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { fullName, brandName, email, whatsappNumber, notes } = req.body;
    if (!fullName) { res.status(400).json({ error: 'fullName is required' }); return; }

    // Find step 1
    const step1 = await prisma.step.findFirst({
      where: { organisationId: req.user.orgId, stepNumber: 1, isActive: true },
    });
    if (!step1) { res.status(400).json({ error: 'Step 1 not configured' }); return; }

    const client = await prisma.client.create({
      data: {
        organisationId: req.user.orgId,
        fullName,
        brandName,
        email,
        whatsappNumber,
        notes,
        currentStepId: step1.id,
        stepEnteredAt: new Date(),
        dateJoined: new Date(),
        createdById: req.user.userId,
        status: 'active',
      },
    });

    // Auto-advance to step 1 (creates tasks + notifications)
    await advanceClientToStep(client.id, step1.id, 'admin', req.user.userId, 'Client created');

    // Reload fresh
    const fresh = await prisma.client.findUnique({
      where: { id: client.id },
      include: { currentStep: true, tasks: true },
    });
    res.status(201).json(fresh);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { fullName, brandName, email, whatsappNumber, notes, status } = req.body;
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: { currentStep: true },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const updated = await prisma.client.update({
      where: { id: req.params.id },
      data: { fullName, brandName, email, whatsappNumber, notes, status },
    });

    // ── NOTIFY: status change → team + admins ────────────────────────
    if (status && status !== client.status) {
      // Get admin name
      const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
      await notifyClientStatusChanged({
        organisationId: req.user.orgId,
        clientName: client.brandName || client.fullName,
        oldStatus: client.status,
        newStatus: status,
        teamName: (client as any).currentStep?.owningTeamName || '',
        clientId: client.id,
        changedByName: actor?.fullName,
      });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/clients/:id/step
router.patch('/:id/step', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { toStepId, reasonNote } = req.body;
    if (!toStepId) { res.status(400).json({ error: 'toStepId required' }); return; }

    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: { currentStep: true },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const toStep = await prisma.step.findFirst({
      where: { id: toStepId, organisationId: req.user.orgId },
    });
    if (!toStep) { res.status(404).json({ error: 'Target step not found' }); return; }

    const direction = toStep.stepNumber > client.currentStep.stepNumber ? 'forward' : 'backward';
    const result = await handleManualStepMove(
      req.params.id,
      toStepId,
      req.user.userId,
      reasonNote || 'Manual step move',
      direction
    );

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/clients/:id/history
router.get('/:id/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const history = await prisma.stepHistory.findMany({
      where: { clientId: req.params.id, organisationId: req.user.orgId },
      include: { fromStep: true, toStep: true, triggeredByUser: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/clients/:id/documents
router.get('/:id/documents', requireAuth, async (req: Request, res: Response) => {
  try {
    const docs = await prisma.document.findMany({
      where: { clientId: req.params.id, organisationId: req.user.orgId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients/:id/documents (upload)
router.post('/:id/documents', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { title, stepId } = req.body;
    const file = req.file;

    const doc = await prisma.document.create({
      data: {
        organisationId: req.user.orgId,
        clientId: req.params.id,
        stepId: stepId || '',
        title: title || file?.originalname || 'Untitled',
        fileUrl: file ? `/uploads/${file.filename}` : undefined,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        uploadedById: req.user.userId,
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients/import (CSV)
router.post('/import', requireAuth, requireRole('admin'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const fs = await import('fs');
    const csvParser = (await import('csv-parser')).default;

    const rows: any[] = [];
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(req.file!.path)
        .pipe(csvParser())
        .on('data', (row: any) => rows.push(row))
        .on('end', resolve)
        .on('error', reject);
    });

    const steps = await prisma.step.findMany({
      where: { organisationId: req.user.orgId },
      orderBy: { stepNumber: 'asc' },
    });
    const stepMap = Object.fromEntries(steps.map((s) => [s.stepNumber, s.id]));

    const errors: { row: number; reason: string }[] = [];
    const toCreate: any[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row['client_name'] || row['Client_name'];
      const stepNum = parseInt(row['current_step_number'] || row['Current_step_number'] || '1');
      if (!name) { errors.push({ row: i + 2, reason: 'Missing client_name' }); continue; }
      if (!stepMap[stepNum]) { errors.push({ row: i + 2, reason: `Invalid step number: ${stepNum}` }); continue; }
      toCreate.push({
        organisationId: req.user.orgId,
        fullName: name,
        email: row['email'] || null,
        whatsappNumber: row['whatsapp'] || null,
        currentStepId: stepMap[stepNum],
        stepEnteredAt: new Date(),
        dateJoined: row['date_joined'] ? new Date(row['date_joined']) : new Date(),
        createdById: req.user.userId,
        status: 'active',
      });
    }

    if (errors.length === 0 || toCreate.length > 0) {
      await prisma.client.createMany({ data: toCreate });
    }

    res.json({ imported: toCreate.length, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
