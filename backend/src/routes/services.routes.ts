import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';

const router = Router();

// POST /api/services/migrate-legacy
router.post('/migrate-legacy', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const orgId = req.user.orgId;
    
    // Check if a service already exists
    let defaultService = await prisma.service.findFirst({
      where: { organisationId: orgId, name: 'Default Service' }
    });

    if (!defaultService) {
      defaultService = await prisma.service.create({
        data: {
          organisationId: orgId,
          name: 'Default Service',
          description: 'Legacy pipeline migrated to a service',
        }
      });
    }

    // Attach all steps that have no serviceId to this service
    await prisma.step.updateMany({
      where: { organisationId: orgId, serviceId: null },
      data: { serviceId: defaultService.id }
    });

    // Attach all clients that have no serviceId to this service
    await prisma.client.updateMany({
      where: { organisationId: orgId, serviceId: null },
      data: { serviceId: defaultService.id }
    });

    res.json({ message: 'Legacy migration complete', service: defaultService });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/services
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      where: { organisationId: req.user.orgId },
      include: {
        steps: {
          where: { clientId: null, isActive: true },
          orderBy: { stepNumber: 'asc' },
          include: { taskTemplates: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    });
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/services/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
      include: {
        steps: {
          where: { clientId: null, isActive: true },
          include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
          orderBy: { stepNumber: 'asc' },
        },
      },
    });
    if (!service) { res.status(404).json({ error: 'Service not found' }); return; }
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/services
router.post('/', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }

    const service = await prisma.service.create({
      data: {
        organisationId: req.user.orgId,
        name,
        description,
      },
    });
    res.status(201).json(service);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/services/:id
router.put('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!service) { res.status(404).json({ error: 'Service not found' }); return; }

    const updated = await prisma.service.update({
      where: { id: req.params.id },
      data: { name, description },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/services/:id
router.delete('/:id', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const service = await prisma.service.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!service) { res.status(404).json({ error: 'Service not found' }); return; }

    await prisma.service.delete({ where: { id: req.params.id } });
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
