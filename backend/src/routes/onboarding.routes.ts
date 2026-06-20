import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../prisma/client';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { advanceClientToStep } from '../services/pipeline.service';

const router = Router();

// POST /api/onboarding/invite — Admin sends invite link
router.post('/invite', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { sentToName, sentToEmail, sentToWhatsapp } = req.body;
    if (!sentToName) { res.status(400).json({ error: 'sentToName required' }); return; }

    const invite = await prisma.onboardingInvite.create({
      data: {
        organisationId: req.user.orgId,
        sentToName,
        sentToEmail,
        sentToWhatsapp,
        createdById: req.user.userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    });

    const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/onboard/${invite.token}`;

    res.status(201).json({ invite, link });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/onboarding/invites — Admin list of sent invites
router.get('/invites', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const invites = await prisma.onboardingInvite.findMany({
      where: { organisationId: req.user.orgId },
      include: { application: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(invites);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/onboarding/token/:token — Public: validate token and get pre-fill data
router.get('/token/:token', async (req: Request, res: Response) => {
  try {
    const invite = await prisma.onboardingInvite.findUnique({
      where: { token: req.params.token },
    });
    if (!invite) { res.status(404).json({ error: 'Invalid or expired link' }); return; }
    if (invite.usedAt) { res.status(410).json({ error: 'This link has already been used' }); return; }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      res.status(410).json({ error: 'This link has expired' }); return;
    }
    res.json({ name: invite.sentToName, email: invite.sentToEmail, whatsapp: invite.sentToWhatsapp });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/onboarding/submit/:token — Public: client submits form
router.post('/submit/:token', async (req: Request, res: Response) => {
  try {
    const invite = await prisma.onboardingInvite.findUnique({
      where: { token: req.params.token },
      include: { application: true },
    });
    if (!invite) { res.status(404).json({ error: 'Invalid link' }); return; }
    if (invite.usedAt) { res.status(410).json({ error: 'This link has already been used' }); return; }
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      res.status(410).json({ error: 'Link expired' }); return;
    }

    const {
      fullName, brandName, email, whatsappNumber, location,
      niche, experience, audienceSize, revenueGoal,
      eventTopic, eventFormat, brandColors, brandTone, notes,
    } = req.body;

    // Create application
    const application = await prisma.pendingApplication.create({
      data: {
        organisationId: invite.organisationId,
        inviteId: invite.id,
        fullName: fullName || invite.sentToName,
        brandName, email: email || invite.sentToEmail,
        whatsappNumber: whatsappNumber || invite.sentToWhatsapp,
        location, niche, experience, audienceSize, revenueGoal,
        eventTopic, eventFormat, brandColors, brandTone, notes,
      },
    });

    // Mark invite as used
    await prisma.onboardingInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    // Notify admins
    const admins = await prisma.user.findMany({
      where: { organisationId: invite.organisationId, role: 'admin', isActive: true },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          organisationId: invite.organisationId,
          userId: admin.id,
          type: 'step_advanced',
          message: `New application received from ${fullName || invite.sentToName} — waiting for your review`,
          referenceId: application.id,
          referenceType: 'application',
        },
      });
    }

    res.status(201).json({ message: 'Application submitted successfully', applicationId: application.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/onboarding/applications — Admin list of pending applications
router.get('/applications', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const apps = await prisma.pendingApplication.findMany({
      where: { organisationId: req.user.orgId },
      include: { invite: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(apps);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/onboarding/applications/:id/approve — Admin approves → creates client + starts pipeline
router.patch('/applications/:id/approve', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const app = await prisma.pendingApplication.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!app) { res.status(404).json({ error: 'Application not found' }); return; }
    if (app.status !== 'pending') { res.status(400).json({ error: 'Application already reviewed' }); return; }

    // Find Step 1
    const step1 = await prisma.step.findFirst({
      where: { organisationId: req.user.orgId, stepNumber: 1, isActive: true },
    });
    if (!step1) { res.status(400).json({ error: 'Step 1 not configured' }); return; }

    // Create client
    const client = await prisma.client.create({
      data: {
        organisationId: req.user.orgId,
        fullName: app.fullName,
        brandName: app.brandName,
        email: app.email,
        whatsappNumber: app.whatsappNumber,
        currentStepId: step1.id,
        stepEnteredAt: new Date(),
        dateJoined: new Date(),
        createdById: req.user.userId,
        status: 'active',
        notes: [
          app.niche ? `Niche: ${app.niche}` : '',
          app.eventTopic ? `Event: ${app.eventTopic}` : '',
          app.notes ? `Notes: ${app.notes}` : '',
        ].filter(Boolean).join('\n') || undefined,
      },
    });

    // Advance to step 1 (creates tasks + notifies team)
    await advanceClientToStep(client.id, step1.id, 'admin', req.user.userId, 'Application approved');

    // Update application status
    await prisma.pendingApplication.update({
      where: { id: app.id },
      data: { status: 'approved', reviewedById: req.user.userId, reviewedAt: new Date() },
    });

    res.json({ client, message: 'Client approved and pipeline started' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/onboarding/applications/:id/reject
router.patch('/applications/:id/reject', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { reviewNote } = req.body;
    const app = await prisma.pendingApplication.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!app) { res.status(404).json({ error: 'Application not found' }); return; }

    const updated = await prisma.pendingApplication.update({
      where: { id: app.id },
      data: { status: 'rejected', reviewedById: req.user.userId, reviewedAt: new Date(), reviewNote },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/onboarding/applications/:id/more-info
router.patch('/applications/:id/more-info', requireAuth, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { reviewNote } = req.body;
    const app = await prisma.pendingApplication.findFirst({
      where: { id: req.params.id, organisationId: req.user.orgId },
    });
    if (!app) { res.status(404).json({ error: 'Application not found' }); return; }

    const updated = await prisma.pendingApplication.update({
      where: { id: app.id },
      data: { status: 'more_info', reviewedById: req.user.userId, reviewedAt: new Date(), reviewNote },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
