import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { notifyClientStatusChanged, notifyClientAdded } from '../services/notify.service';
import { computeClientStatus, advanceClientToStep, handleManualStepMove, initializeClientPipeline, importClientWithCustomPipeline } from '../services/pipeline.service';
import { uploadToCloudinary } from '../services/cloudinary.service';
import { validatePhone } from '../utils/validation';


const router = Router();
const upload = multer({ dest: 'uploads/' });

// GET /api/clients
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;

    // Build scoped WHERE clause by role
    let where: any = { organisationId: orgId };

    const teamNames = teamName
      ? teamName
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];

    if (role === 'team_leader' && teamNames.length > 0) {
      // Team leader sees only clients currently in their team's step
      const teamSteps = await prisma.step.findMany({
        where: { organisationId: orgId, owningTeamName: { in: teamNames } },
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

    // Non-admins cannot see blocked clients
    if (role !== 'admin') {
      where.tasks = {
        none: {
          status: 'blocked'
        }
      };
    }

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

    if (role === 'team_leader' && req.user.teamName) {
      const teamMemberIds = await prisma.user
        .findMany({ where: { organisationId: orgId, teamName: req.user.teamName, isActive: true }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      const teamTaskIds = await prisma.task
        .findMany({ where: { organisationId: orgId, clientId: req.params.id, assignedToId: { in: teamMemberIds } }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      const teamStepIds = await prisma.step
        .findMany({ where: { organisationId: orgId, owningTeamName: req.user.teamName }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      docWhere = {
        OR: [
          { uploadedById: { in: teamMemberIds } },
          { taskId: { in: teamTaskIds } },
          { stepId: { in: teamStepIds } },
        ]
      };
    } else if (role === 'team_member') {
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

    if (role !== 'admin') {
      const isBlocked = client.tasks.some((t) => t.status === 'blocked');
      if (isBlocked) {
        res.status(403).json({ error: 'Access denied: client is blocked.' });
        return;
      }
    }

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
    if (whatsappNumber && !validatePhone(whatsappNumber)) {
      res.status(400).json({ error: 'Invalid WhatsApp number format. Must be 7-15 digits.' });
      return;
    }


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
    if (whatsappNumber && !validatePhone(whatsappNumber)) {
      res.status(400).json({ error: 'Invalid WhatsApp number format. Must be 7-15 digits.' });
      return;
    }


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

// POST /api/clients/:id/unblock
router.post('/:id/unblock', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    // Update all blocked tasks for this client to 'pending'
    await prisma.task.updateMany({
      where: {
        clientId: client.id,
        status: 'blocked',
      },
      data: {
        status: 'pending',
      },
    });

    res.json({ message: 'Client tasks unblocked successfully' });
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

    if (role === 'team_leader' && req.user.teamName) {
      const teamMemberIds = await prisma.user
        .findMany({ where: { organisationId: orgId, teamName: req.user.teamName, isActive: true }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      const teamTaskIds = await prisma.task
        .findMany({ where: { organisationId: orgId, clientId: req.params.id, assignedToId: { in: teamMemberIds } }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      const teamStepIds = await prisma.step
        .findMany({ where: { organisationId: orgId, owningTeamName: req.user.teamName }, select: { id: true } })
        .then((rows) => rows.map((r) => r.id));

      docWhere = {
        clientId: req.params.id,
        organisationId: orgId,
        OR: [
          { uploadedById: { in: teamMemberIds } },
          { taskId: { in: teamTaskIds } },
          { stepId: { in: teamStepIds } },
        ]
      };
    } else if (role === 'team_member') {
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

    let fileUrl: string | undefined;
    if (file) {
      fileUrl = await uploadToCloudinary(file.path, 'documents', 'auto');
      try {
        fs.unlinkSync(file.path);
      } catch (err) {
        console.error('[Document Upload] Failed to delete temp file:', err);
      }
    }

    const doc = await prisma.document.create({
      data: {
        organisationId: req.user.orgId,
        clientId: req.params.id,
        stepId: stepId || '',
        title: title || file?.originalname || 'Untitled',
        fileUrl: fileUrl,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        uploadedById: req.user.userId,
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[Document Upload] error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/clients/import (CSV/Excel)
router.post('/import', requireAuth, requireRole('admin'), upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    const XLSX = await import('xlsx');
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

    if (rows.length === 0) {
      res.status(400).json({ error: 'Uploaded file is empty' });
      return;
    }

    // Determine the format by checking headers of the first row
    const firstRowKeys = Object.keys(rows[0]);
    const isCustomExcel = firstRowKeys.some(k => k.trim() === 'Clients Name' || k.trim() === 'Clients name');

    // Find any existing step to satisfy the foreign key constraint initially
    const firstStep = await prisma.step.findFirst({
      where: { organisationId: req.user.orgId },
    });
    if (!firstStep) { res.status(400).json({ error: 'System steps not seeded. Please run database setup first.' }); return; }

    // Write headers for NDJSON streaming
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const errors: { row: number; reason: string }[] = [];
    const importedClients = [];

    if (isCustomExcel) {
      const updateExisting = req.query.updateExisting === 'true';

      // Read name aliases from Sheet3 if it exists
      const nameAliases: Record<string, string[]> = {};
      const sheet3Name = workbook.SheetNames.find(name => name.toLowerCase().includes('sheet3'));
      if (sheet3Name) {
        const sheet3 = workbook.Sheets[sheet3Name];
        const sheet3Rows = XLSX.utils.sheet_to_json(sheet3) as any[];
        for (const r of sheet3Rows) {
          const keys = Object.keys(r);
          if (keys.length >= 2) {
            const val1 = String(r[keys[0]] || '').trim();
            const val2 = String(r[keys[1]] || '').trim();
            if (val1 && val2 && val1 !== 'undefined' && val2 !== 'undefined') {
              const v1 = val1.toLowerCase();
              const v2 = val2.toLowerCase();
              if (!nameAliases[v1]) nameAliases[v1] = [];
              if (!nameAliases[v1].includes(val2)) nameAliases[v1].push(val2);
              if (!nameAliases[v2]) nameAliases[v2] = [];
              if (!nameAliases[v2].includes(val1)) nameAliases[v2].push(val1);
            }
          }
        }
      }

      // Pre-fetch existing client names to skip duplicates
      const existingNames = new Set(
        (await prisma.client.findMany({
          where: { organisationId: req.user.orgId },
          select: { fullName: true },
        })).map(c => c.fullName.toLowerCase().trim())
      );

      // Build valid rows with index
      const validRows: { idx: number; row: any; clientName: string; aliases: string[] }[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const clientName = (row['Clients Name'] || row['Clients name'] || '').trim();
        if (!clientName) {
          errors.push({ row: i + 2, reason: 'Missing Clients Name column' });
          continue;
        }

        const aliases = nameAliases[clientName.toLowerCase()] || [];
        const hasMatch = existingNames.has(clientName.toLowerCase()) || aliases.some(a => existingNames.has(a.toLowerCase()));

        if (hasMatch) {
          if (!updateExisting) {
            errors.push({ row: i + 2, reason: `Client "${clientName}" already exists — skipped` });
            continue;
          }
        }
        validRows.push({ idx: i, row, clientName, aliases });
      }

      // Write initial progress
      res.write(JSON.stringify({ type: 'progress', imported: 0, total: validRows.length }) + '\n');

      // Process sequentially to avoid DB deadlocks and allow accurate progress streaming
      for (let i = 0; i < validRows.length; i++) {
        const { idx, row, clientName, aliases } = validRows[i];
        const email = row['email'] || row['Email'] || null;
        const whatsapp = row['whatsapp'] || row['Whatsapp'] || row['phone'] || row['Phone'] || null;
        const rawDate = row['date_joined'] || row['Date Joined'] || row['Date joined'] || row['Onboarding Date'] || row['Onboarding date'];
        const dateJoined = rawDate ? new Date(rawDate) : new Date();
        const notesVal = row['notes'] || row['Notes'] || row['note'] || row['Note'] || null;

        try {
          const client = await importClientWithCustomPipeline(
            {
              fullName: clientName,
              email,
              whatsappNumber: whatsapp,
              dateJoined: isNaN(dateJoined.getTime()) ? new Date() : dateJoined,
              notes: notesVal,
              aliases,
            },
            row,
            req.user.orgId,
            req.user.userId
          );
          importedClients.push(client);
        } catch (err: any) {
          console.error(`Error importing row ${idx + 2}:`, err);
          errors.push({ row: idx + 2, reason: err?.message || 'Error importing row' });
        }

        res.write(JSON.stringify({ type: 'progress', imported: i + 1, total: validRows.length }) + '\n');
      }
    } else {
      // Write initial progress
      res.write(JSON.stringify({ type: 'progress', imported: 0, total: rows.length }) + '\n');

      // Standard CSV format
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const name = (row['client_name'] || row['Client_name'] || '').trim();
        const stepNum = parseInt(row['current_step_number'] || row['Current_step_number'] || '1');
        const notesVal = row['notes'] || row['Notes'] || row['note'] || row['Note'] || null;
        if (!name) { errors.push({ row: i + 2, reason: 'Missing client_name' }); }
        else if (isNaN(stepNum) || stepNum < 1 || stepNum > 12) { errors.push({ row: i + 2, reason: `Invalid step number: ${row['current_step_number'] || '1'}` }); }
        else {
          try {
            const client = await prisma.client.create({
              data: {
                organisationId: req.user.orgId,
                fullName: name,
                email: row['email'] || row['Email'] || null,
                whatsappNumber: row['whatsapp'] || row['Whatsapp'] || row['phone'] || row['Phone'] || null,
                currentStepId: firstStep.id, // temporary reference
                stepEnteredAt: new Date(),
                dateJoined: row['date_joined'] || row['Date Joined'] || row['Date joined'] ? new Date(row['date_joined'] || row['Date Joined'] || row['Date joined']) : new Date(),
                createdById: req.user.userId,
                status: 'active',
                notes: notesVal ? `${notesVal} [Imported via CSV/Excel]` : 'Imported via CSV/Excel',
              },
            });

            // Initialize client-specific pipeline steps and advance to the imported step number
            await initializeClientPipeline(client.id, req.user.orgId, req.user.userId, stepNum);
            importedClients.push(client);
          } catch (err: any) {
            console.error(`Error importing row ${i + 2}:`, err);
            errors.push({ row: i + 2, reason: err.message || 'Error importing row' });
          }
        }

        res.write(JSON.stringify({ type: 'progress', imported: i + 1, total: rows.length }) + '\n');
      }
    }

    if (errors.length === 0 || importedClients.length > 0) {
      // Notify organization that clients were imported
      try {
        const actor = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { fullName: true } });
        const actorName = actor?.fullName || 'Admin';
        const formatName = isCustomExcel ? 'Excel status sheet' : 'CSV';
        const msg = `🆕 ${importedClients.length} new client${importedClients.length !== 1 ? 's' : ''} imported via ${formatName} by ${actorName}`;
        
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
        console.error('[client import notify] failed:', err);
      }
    }

    res.write(JSON.stringify({ type: 'result', imported: importedClients.length, errors }) + '\n');
    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  } finally {
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error('[Clients Import] Failed to delete temp file:', err);
      }
    }
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

// DELETE /api/clients/import/cleanup
router.delete('/import/cleanup', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: {
        organisationId: req.user.orgId,
        notes: {
          contains: 'Imported via CSV/Excel'
        }
      },
      select: { id: true },
    });

    if (clients.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    const clientIds = clients.map(c => c.id);

    const steps = await prisma.step.findMany({
      where: { clientId: { in: clientIds } },
      select: { id: true },
    });
    const stepIds = steps.map((s) => s.id);

    const otherStep = await prisma.step.findFirst({
      where: {
        OR: [
          { clientId: null },
          { clientId: { notIn: clientIds } }
        ]
      },
      select: { id: true }
    });

    await prisma.$transaction(async (tx) => {
      // 1. Delete StepTaskTemplate records for these steps
      if (stepIds.length > 0) {
        await tx.stepTaskTemplate.deleteMany({ where: { stepId: { in: stepIds } } });
      }

      // 2. Delete document, stepHistory, task
      await tx.document.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.stepHistory.deleteMany({ where: { clientId: { in: clientIds } } });
      await tx.task.deleteMany({ where: { clientId: { in: clientIds } } });

      if (otherStep) {
        // Point currentStepId away from client's steps to prevent constraint violation
        await tx.client.updateMany({
          where: { id: { in: clientIds } },
          data: { currentStepId: otherStep.id }
        });
        await tx.step.deleteMany({ where: { clientId: { in: clientIds } } });
        await tx.client.deleteMany({
          where: { id: { in: clientIds } },
        });
      } else {
        // If no other step exists, delete Clients first then delete steps
        await tx.client.deleteMany({
          where: { id: { in: clientIds } },
        });
        await tx.step.deleteMany({ where: { clientId: { in: clientIds } } });
      }
    });

    res.json({ success: true, count: clientIds.length });
  } catch (err) {
    console.error('[clients] DELETE bulk import error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients (bulk delete)
router.delete('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { clientIds } = req.body;
    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      res.status(400).json({ error: 'clientIds array is required' });
      return;
    }

    const clients = await prisma.client.findMany({
      where: {
        id: { in: clientIds },
        organisationId: req.user.orgId,
      },
      select: { id: true },
    });

    if (clients.length === 0) {
      res.json({ success: true, count: 0 });
      return;
    }

    const validClientIds = clients.map(c => c.id);

    const steps = await prisma.step.findMany({
      where: { clientId: { in: validClientIds } },
      select: { id: true },
    });
    const stepIds = steps.map((s) => s.id);

    const otherStep = await prisma.step.findFirst({
      where: {
        OR: [
          { clientId: null },
          { clientId: { notIn: validClientIds } }
        ]
      },
      select: { id: true }
    });

    await prisma.$transaction(async (tx) => {
      // 1. Delete StepTaskTemplate records for these steps
      if (stepIds.length > 0) {
        await tx.stepTaskTemplate.deleteMany({ where: { stepId: { in: stepIds } } });
      }

      // 2. Delete document, stepHistory, task
      await tx.document.deleteMany({ where: { clientId: { in: validClientIds } } });
      await tx.stepHistory.deleteMany({ where: { clientId: { in: validClientIds } } });
      await tx.task.deleteMany({ where: { clientId: { in: validClientIds } } });

      if (otherStep) {
        // Point currentStepId away from client's steps to prevent constraint violation
        await tx.client.updateMany({
          where: { id: { in: validClientIds } },
          data: { currentStepId: otherStep.id }
        });
        await tx.step.deleteMany({ where: { clientId: { in: validClientIds } } });
        await tx.client.deleteMany({
          where: { id: { in: validClientIds } },
        });
      } else {
        // If no other step exists, delete Clients first then delete steps
        await tx.client.deleteMany({
          where: { id: { in: validClientIds } },
        });
        await tx.step.deleteMany({ where: { clientId: { in: validClientIds } } });
      }
    });

    res.json({ success: true, count: validClientIds.length });
  } catch (err) {
    console.error('[clients] DELETE bulk error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const client = await prisma.client.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const steps = await prisma.step.findMany({
      where: { clientId: req.params.id },
      select: { id: true },
    });
    const stepIds = steps.map((s) => s.id);

    const otherStep = await prisma.step.findFirst({
      where: {
        OR: [
          { clientId: null },
          { clientId: { not: req.params.id } }
        ]
      },
      select: { id: true }
    });

    await prisma.$transaction(async (tx) => {
      // 1. Delete StepTaskTemplate records for this client's steps
      if (stepIds.length > 0) {
        await tx.stepTaskTemplate.deleteMany({ where: { stepId: { in: stepIds } } });
      }

      // 2. Delete document, stepHistory, task
      await tx.document.deleteMany({ where: { clientId: req.params.id } });
      await tx.stepHistory.deleteMany({ where: { clientId: req.params.id } });
      await tx.task.deleteMany({ where: { clientId: req.params.id } });

      if (otherStep) {
        // Point currentStepId away from client's steps to prevent constraint violation
        await tx.client.update({
          where: { id: req.params.id },
          data: { currentStepId: otherStep.id }
        });
        await tx.step.deleteMany({ where: { clientId: req.params.id } });
        await tx.client.delete({
          where: { id: req.params.id },
        });
      } else {
        // If no other step exists, delete Client first to trigger cascading / drop constraint, then delete steps
        await tx.client.delete({
          where: { id: req.params.id },
        });
        await tx.step.deleteMany({ where: { clientId: req.params.id } });
      }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[clients] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
