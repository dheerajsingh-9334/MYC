import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// GET /api/steps
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const steps = await prisma.step.findMany({
      where: { organisationId: req.user.orgId, isActive: true },
      include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { stepNumber: 'asc' },
    });
    res.json(steps);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/steps/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const step = await prisma.step.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!step) { res.status(404).json({ error: 'Step not found' }); return; }
    res.json(step);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/steps/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, owningTeamName, slaDays, description } = req.body;
    const step = await prisma.step.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!step) { res.status(404).json({ error: 'Step not found' }); return; }

    const updated = await prisma.step.update({
      where: { id: req.params.id },
      data: { name, owningTeamName, slaDays, description },
      include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/steps/:id — update step + replace all templates atomically
router.patch('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, owningTeamName, slaDays, description, taskTemplates } = req.body;
    const step = await prisma.step.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!step) { res.status(404).json({ error: 'Step not found' }); return; }

    // Run in transaction: update step + delete old templates + create new ones
    const result = await prisma.$transaction(async (tx) => {
      const updatedStep = await tx.step.update({
        where: { id: req.params.id },
        data: { name, owningTeamName, slaDays, description },
      });

      if (Array.isArray(taskTemplates)) {
        // Delete all existing templates for this step
        await tx.stepTaskTemplate.deleteMany({ where: { stepId: req.params.id } });
        // Recreate from the array sent by the UI
        for (let i = 0; i < taskTemplates.length; i++) {
          const t = taskTemplates[i];
          if (!t.title?.trim()) continue; // skip blank rows
          await tx.stepTaskTemplate.create({
            data: {
              stepId: req.params.id,
              organisationId: req.user.orgId,
              title: t.title,
              description: t.description || null,
              relativeDueDay: parseInt(t.relativeDueDay) || 1,
              priority: t.priority || 'normal',
              sortOrder: i,
            },
          });
        }
      }

      return tx.step.findUnique({
        where: { id: req.params.id },
        include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
      });
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/steps/:id/templates
router.get('/:id/templates', requireAuth, async (req: Request, res: Response) => {
  try {
    const templates = await prisma.stepTaskTemplate.findMany({
      where: { stepId: req.params.id, organisationId: req.user.orgId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/steps/:id/templates
router.post('/:id/templates', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { title, description, relativeDueDay, priority, sortOrder } = req.body;
    const template = await prisma.stepTaskTemplate.create({
      data: {
        stepId: req.params.id,
        organisationId: req.user.orgId,
        title,
        description,
        relativeDueDay: parseInt(relativeDueDay),
        priority: priority || 'normal',
        sortOrder: parseInt(sortOrder || '0'),
      },
    });
    res.status(201).json(template);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/steps/:id/templates/:templateId
router.put('/:id/templates/:templateId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { title, description, relativeDueDay, priority, sortOrder } = req.body;
    const updated = await prisma.stepTaskTemplate.update({
      where: { id: req.params.templateId },
      data: { title, description, relativeDueDay, priority, sortOrder },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/steps/:id/templates/:templateId
router.delete('/:id/templates/:templateId', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    await prisma.stepTaskTemplate.delete({ where: { id: req.params.templateId } });
    res.json({ message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/steps - Create a new step
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, owningTeamName, slaDays, description, stepNumber } = req.body;
    if (!name || !owningTeamName) {
      res.status(400).json({ error: 'name and owningTeamName are required' });
      return;
    }

    const orgId = req.user.orgId;
    const targetStepNumber = parseInt(stepNumber);

    const newStep = await prisma.$transaction(async (tx) => {
      // Get all active steps
      const activeSteps = await tx.step.findMany({
        where: { organisationId: orgId, isActive: true },
        orderBy: { stepNumber: 'asc' },
      });

      const maxStepNumber = activeSteps.length;
      let finalStepNumber = maxStepNumber + 1;

      if (!isNaN(targetStepNumber) && targetStepNumber >= 1) {
        if (targetStepNumber <= maxStepNumber) {
          finalStepNumber = targetStepNumber;
          // Shift all steps starting from finalStepNumber by +1
          for (let i = activeSteps.length - 1; i >= 0; i--) {
            const s = activeSteps[i];
            if (s.stepNumber >= finalStepNumber) {
              await tx.step.update({
                where: { id: s.id },
                data: { stepNumber: s.stepNumber + 1 },
              });
            }
          }
        }
      }

      return tx.step.create({
        data: {
          organisationId: orgId,
          stepNumber: finalStepNumber,
          name,
          owningTeamName,
          slaDays: parseInt(slaDays) || 3,
          description: description || null,
          isActive: true
        },
        include: { taskTemplates: true }
      });
    });

    res.status(201).json(newStep);
  } catch (err: any) {
    console.error('[steps] POST error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/steps/:id - Delete (deactivate) a step and renumber remaining steps
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const step = await prisma.step.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!step) {
      res.status(404).json({ error: 'Step not found' });
      return;
    }

    // Soft delete the step
    await prisma.step.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    // Also reorder the remaining steps so their stepNumber is contiguous
    const remainingSteps = await prisma.step.findMany({
      where: { organisationId: req.user.orgId, isActive: true },
      orderBy: { stepNumber: 'asc' },
    });

    for (let i = 0; i < remainingSteps.length; i++) {
      await prisma.step.update({
        where: { id: remainingSteps[i].id },
        data: { stepNumber: i + 1 },
      });
    }

    res.json({ message: 'Step deleted and remaining steps renumbered' });
  } catch (err) {
    console.error('[steps] DELETE error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
