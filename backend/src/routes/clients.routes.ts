import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { notifyClientStatusChanged, notifyClientAdded } from '../services/notify.service';
import { computeClientStatus, advanceClientToStep, handleManualStepMove, initializeClientPipeline } from '../services/pipeline.service';

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
      include: {
        currentStep: true,
        tasks: true,
        stepHistory: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = clients.map((c) => {
      const status = computeClientStatus(c.tasks);
      const daysInStep = Math.floor(
        (Date.now() - new Date(c.stepEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      let completionDurationDays = 0;
      const joinedDate = c.dateJoined || c.createdAt;
      if (c.status === 'completed') {
        const lastHistoryDate = c.stepHistory[0]?.createdAt || c.createdAt;
        const durationMs = lastHistoryDate.getTime() - joinedDate.getTime();
        completionDurationDays = Math.max(0, Math.round(durationMs / (1000 * 60 * 60 * 24)));
      } else {
        const durationMs = Date.now() - joinedDate.getTime();
        completionDurationDays = Math.max(0, Math.round(durationMs / (1000 * 60 * 60 * 24)));
      }

      return {
        id: c.id,
        fullName: c.fullName,
        brandName: c.brandName,
        email: c.email,
        whatsappNumber: c.whatsappNumber,
        status: c.status,
        computedStatus: status,
        currentStep: c.currentStep,
        stepEnteredAt: c.stepEnteredAt,
        daysInStep,
        dateJoined: c.dateJoined,
        taskCount: c.tasks.length,
        completionDurationDays,
        isPinned: c.isPinned,
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
    const { role, userId, orgId } = req.user;
    let docWhere: any = undefined;

    if (role !== 'admin') {
      const myTasks = await prisma.task.findMany({
        where: { assignedToId: userId, organisationId: orgId, clientId: req.params.id },
        select: { id: true, stepId: true },
      });
      const myTaskIds = myTasks.map(t => t.id);
      const myStepIds = myTasks.map(t => t.stepId);

      const admins = await prisma.user.findMany({
        where: { organisationId: orgId, role: 'admin' },
        select: { id: true },
      });
      const adminIds = admins.map(a => a.id);

      docWhere = {
        OR: [
          { uploadedById: userId },
          { taskId: { in: myTaskIds } },
        ]
      };
      if (myStepIds.length > 0) {
        docWhere.OR.push({
          uploadedById: { in: adminIds },
          stepId: { in: myStepIds },
        });
      }
    }

    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: orgId },
      include: {
        currentStep: true,
        tasks: {
          include: { assignedTo: true, documents: true },
          orderBy: { dueDate: 'asc' },
        },
        stepHistory: {
          include: { fromStep: true, toStep: true, triggeredByUser: true },
          orderBy: { createdAt: 'desc' },
        },
        documents: {
          where: docWhere,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const computedStatus = computeClientStatus(client.tasks);
    const daysInStep = Math.floor(
      (Date.now() - new Date(client.stepEnteredAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Fetch uploaders for documents to show who uploaded them and their team
    let documentsWithUploader: any[] = [];
    if (client.documents && client.documents.length > 0) {
      const uploaderIds = Array.from(new Set(client.documents.map(d => d.uploadedById)));
      const uploaders = await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, fullName: true, email: true, teamName: true, avatarUrl: true },
      });
      const uploaderMap = new Map(uploaders.map(u => [u.id, u]));
      documentsWithUploader = client.documents.map(d => ({
        ...d,
        uploadedBy: uploaderMap.get(d.uploadedById) || { fullName: 'System', teamName: 'Unassigned' }
      }));
    }

    res.json({ ...client, documents: documentsWithUploader, computedStatus, daysInStep });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { fullName, brandName, email, whatsappNumber, notes } = req.body;
    if (!fullName) { res.status(400).json({ error: 'fullName is required' }); return; }

    // Find any existing step to satisfy the foreign key constraint initially
    const firstStep = await prisma.step.findFirst({
      where: { organisationId: req.user.orgId },
    });
    if (!firstStep) { res.status(400).json({ error: 'System steps not seeded. Please run database setup first.' }); return; }

    const client = await prisma.client.create({
      data: {
        organisationId: req.user.orgId,
        fullName,
        brandName,
        email,
        whatsappNumber,
        notes,
        currentStepId: firstStep.id, // temporary reference
        stepEnteredAt: new Date(),
        dateJoined: new Date(),
        createdById: req.user.userId,
        status: 'active',
      },
    });

    // Initialize client-specific steps and advance to step 1
    await initializeClientPipeline(client.id, req.user.orgId, req.user.userId, 1);

    // Notify organization that client was added
    try {
      const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
      await notifyClientAdded({
        organisationId: req.user.orgId,
        clientName: brandName || fullName,
        clientId: client.id,
        createdByName: actor?.fullName,
      });
    } catch (err) {
      console.error('[notifyClientAdded] failed:', err);
    }

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
    const { role, userId, orgId } = req.user;
    let docWhere: any = { clientId: req.params.id, organisationId: orgId };

    if (role !== 'admin') {
      const myTasks = await prisma.task.findMany({
        where: { assignedToId: userId, organisationId: orgId, clientId: req.params.id },
        select: { id: true, stepId: true },
      });
      const myTaskIds = myTasks.map(t => t.id);
      const myStepIds = myTasks.map(t => t.stepId);

      const admins = await prisma.user.findMany({
        where: { organisationId: orgId, role: 'admin' },
        select: { id: true },
      });
      const adminIds = admins.map(a => a.id);

      const filterOR: any[] = [
        { uploadedById: userId },
        { taskId: { in: myTaskIds } },
      ];
      if (myStepIds.length > 0) {
        filterOR.push({
          uploadedById: { in: adminIds },
          stepId: { in: myStepIds },
        });
      }

      docWhere = {
        clientId: req.params.id,
        organisationId: orgId,
        OR: filterOR,
      };
    }

    const docs = await prisma.document.findMany({
      where: docWhere,
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

    // Find any existing step to satisfy the foreign key constraint initially
    const firstStep = await prisma.step.findFirst({
      where: { organisationId: req.user.orgId },
    });
    if (!firstStep) { res.status(400).json({ error: 'System steps not seeded. Please run database setup first.' }); return; }

    const errors: { row: number; reason: string }[] = [];
    const importedClients = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = (row['client_name'] || row['Client_name'] || '').trim();
      const stepNum = parseInt(row['current_step_number'] || row['Current_step_number'] || '1');
      if (!name) { errors.push({ row: i + 2, reason: 'Missing client_name' }); continue; }
      if (isNaN(stepNum) || stepNum < 1 || stepNum > 12) { errors.push({ row: i + 2, reason: `Invalid step number: ${row['current_step_number'] || '1'}` }); continue; }

      const client = await prisma.client.create({
        data: {
          organisationId: req.user.orgId,
          fullName: name,
          email: row['email'] || null,
          whatsappNumber: row['whatsapp'] || null,
          currentStepId: firstStep.id, // temporary reference
          stepEnteredAt: new Date(),
          dateJoined: row['date_joined'] ? new Date(row['date_joined']) : new Date(),
          createdById: req.user.userId,
          status: 'active',
        },
      });

      // Initialize client-specific pipeline steps and advance to the imported step number
      await initializeClientPipeline(client.id, req.user.orgId, req.user.userId, stepNum);
      importedClients.push(client);
    }

    if (errors.length === 0 || importedClients.length > 0) {
      // Notify organization that clients were imported
      try {
        const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
        const actorName = actor?.fullName || 'Admin';
        const msg = `🆕 ${importedClients.length} new client${importedClients.length !== 1 ? 's' : ''} imported via CSV by ${actorName}`;
        
        const allUsers = await prisma.user.findMany({
          where: { organisationId: req.user.orgId, isActive: true },
          select: { id: true },
        });
        
        const seen = new Set<string>();
        const payloads = [];
        for (const u of allUsers) {
          if (seen.has(u.id)) continue;
          seen.add(u.id);
          payloads.push({
            organisationId: req.user.orgId,
            userId: u.id,
            type: 'client_status_changed',
            message: msg,
            referenceId: '',
            referenceType: 'client',
          });
        }
        await prisma.notification.createMany({ data: payloads as any });
      } catch (err) {
        console.error('[csv client import notify] failed:', err);
      }
    }

    res.json({ imported: importedClients.length, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/clients/:id/pin
router.patch('/:id/pin', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.client.updateMany({
      where: { id: req.params.id, organisationId: req.user.orgId },
      data: { isPinned: true },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/clients/:id/unpin
router.patch('/:id/unpin', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.client.updateMany({
      where: { id: req.params.id, organisationId: req.user.orgId },
      data: { isPinned: false },
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
