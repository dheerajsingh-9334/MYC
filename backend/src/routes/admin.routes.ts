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

export default router;
