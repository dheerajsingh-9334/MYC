import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import prisma from '../prisma/client';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// GET /api/vault — file-based tree across the org.
// Returns:
//   {
//     folders: [
//       { id: 'client_<id>', name: 'Client Name', type: 'client',
//         children: [ { id: 'step_<id>', name: 'Step 01 — Onboarding Intake', type: 'step',
//                       children: [ { id: 'doc_<id>', name: 'welcome.pdf', type: 'doc', ... } ] } ] }
//     ]
//   }
// Admin sees all clients; team_leader sees clients in their team's steps;
// team_member sees clients they have at least one task for.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { role, orgId, teamName, userId } = req.user;

    let clientWhere: any = { organisationId: orgId };
    if (role === 'team_leader' && teamName) {
      const teamSteps = await prisma.step.findMany({
        where: { organisationId: orgId, owningTeamName: teamName },
        select: { id: true },
      });
      clientWhere.currentStepId = { in: teamSteps.map((s) => s.id) };
    } else if (role === 'team_member') {
      const myClientIds = await prisma.task
        .findMany({ where: { assignedToId: userId, organisationId: orgId }, select: { clientId: true }, distinct: ['clientId'] })
        .then((rows) => rows.map((r) => r.clientId));
      clientWhere.id = { in: myClientIds };
    }

    const clients = await prisma.client.findMany({
      where: clientWhere,
      orderBy: { brandName: 'asc' },
      select: {
        id: true, fullName: true, brandName: true, currentStepId: true,
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const steps = await prisma.step.findMany({
      where: { organisationId: orgId },
      select: { id: true, name: true, stepNumber: true },
    });
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    // Aggregate docs by client for the tree
    const folders = clients.map((c) => {
      // Group documents by stepId
      const byStep = new Map<string, any[]>();
      for (const d of c.documents) {
        const arr = byStep.get(d.stepId) || [];
        arr.push({
          id: `doc_${d.id}`,
          rawId: d.id,
          name: d.title || 'Untitled',
          type: 'doc',
          fileUrl: d.fileUrl,
          mimeType: d.mimeType,
          fileSize: d.fileSize,
          createdAt: d.createdAt,
        });
        byStep.set(d.stepId, arr);
      }

      const children = Array.from(byStep.entries()).map(([stepId, docs]) => {
        const step = stepMap.get(stepId);
        const stepName = step ? `Step ${String(step.stepNumber).padStart(2, '0')} — ${step.name}` : 'Step';
        return {
          id: `step_${stepId}_${c.id}`,
          name: stepName,
          type: 'step',
          childCount: docs.length,
          children: docs,
        };
      });

      // Clients without docs still appear as empty folders so the tree
      // is complete (an admin wants to see "this client has nothing yet").
      return {
        id: `client_${c.id}`,
        name: c.brandName || c.fullName,
        fullName: c.fullName,
        type: 'client',
        childCount: c.documents.length,
        stepCount: children.length,
        children,
      };
    });

    res.json({ folders, totalDocs: clients.reduce((s, c) => s + c.documents.length, 0) });
  } catch (err) {
    console.error('[vault] GET error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/vault/upload — multipart upload of a document.
// Body (form): clientId, stepId, title, file
router.post('/upload', requireAuth, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { clientId, stepId, title } = req.body;
    const file = req.file;
    if (!clientId || !stepId) {
      res.status(400).json({ error: 'clientId and stepId required' });
      return;
    }

    const client = await prisma.client.findFirst({
      where: { id: clientId, organisationId: req.user.orgId },
    });
    if (!client) { res.status(404).json({ error: 'Client not found' }); return; }

    const doc = await prisma.document.create({
      data: {
        organisationId: req.user.orgId,
        clientId,
        stepId,
        title: title || file?.originalname || 'Untitled',
        fileUrl: file ? `/uploads/${file.filename}` : undefined,
        fileSize: file?.size,
        mimeType: file?.mimetype,
        uploadedById: req.user.userId,
      },
    });
    res.status(201).json(doc);
  } catch (err) {
    console.error('[vault] POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/vault/:docId — remove a document. Admin only.
router.delete('/:docId', requireAuth, async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin only' });
      return;
    }
    const doc = await prisma.document.findFirst({
      where: { id: req.params.docId, organisationId: req.user.orgId },
    });
    if (!doc) { res.status(404).json({ error: 'Document not found' }); return; }
    await prisma.document.delete({ where: { id: doc.id } });
    res.json({ ok: true });
  } catch (err) {
    console.error('[vault] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
