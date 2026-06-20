import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create organisation
  const org = await prisma.organisation.upsert({
    where: { slug: 'myc' },
    update: {},
    create: { name: 'MyC', slug: 'myc', isActive: true },
  });
  console.log('✅ Organisation created:', org.name);

  // Create admin user
  const adminHash = await bcrypt.hash('password123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@myc.in' },
    update: {},
    create: {
      organisationId: org.id,
      email: 'admin@myc.in',
      passwordHash: adminHash,
      fullName: 'Ambesh Kumar',
      role: 'admin',
      isActive: true,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create team members
  const teamMembers = [
    { email: 'rajan@myc.in', fullName: 'Rajan Mehta', teamName: 'Tech Team' },
    { email: 'neha@myc.in', fullName: 'Neha Singh', teamName: 'Design Team' },
    { email: 'sneha@myc.in', fullName: 'Sneha Pillai', teamName: 'Sales Team' },
    { email: 'karan@myc.in', fullName: 'Karan Roy', teamName: 'Creative Team' },
    { email: 'amit@myc.in', fullName: 'Amit Sharma', teamName: 'Automation Team' },
    { email: 'preethi@myc.in', fullName: 'Preethi Nair', teamName: 'Event Team' },
    { email: 'rahul@myc.in', fullName: 'Rahul Das', teamName: 'Media Buyer' },
    { email: 'divya@myc.in', fullName: 'Divya Menon', teamName: 'Intake Team' },
  ];

  // One leader per team — receives the first notification when a client
  // enters the step, included in round-robin task assignment, and can
  // reassign/reassign through the Team page.
  const teamLeaders = [
    { email: 'lead.tech@myc.in',       fullName: 'Vikram Joshi',  teamName: 'Tech Team' },
    { email: 'lead.design@myc.in',     fullName: 'Ananya Bose',   teamName: 'Design Team' },
    { email: 'lead.sales@myc.in',      fullName: 'Rohan Verma',   teamName: 'Sales Team' },
    { email: 'lead.creative@myc.in',   fullName: 'Tara Krishnan', teamName: 'Creative Team' },
    { email: 'lead.automation@myc.in', fullName: 'Sandeep Rao',   teamName: 'Automation Team' },
    { email: 'lead.event@myc.in',      fullName: 'Maya Reddy',    teamName: 'Event Team' },
    { email: 'lead.media@myc.in',      fullName: 'Arjun Patel',   teamName: 'Media Buyer' },
    { email: 'lead.intake@myc.in',     fullName: 'Pooja Saxena',  teamName: 'Intake Team' },
  ];

  const memberMap: Record<string, string> = {};
  for (const m of teamMembers) {
    const hash = await bcrypt.hash('password123', 10);
    const user = await prisma.user.upsert({
      where: { email: m.email },
      update: {},
      create: {
        organisationId: org.id,
        email: m.email,
        passwordHash: hash,
        fullName: m.fullName,
        role: 'team_member',
        teamName: m.teamName,
        isActive: true,
      },
    });
    memberMap[m.teamName] = user.id;
    console.log('✅ Team member created:', user.email);
  }

  for (const l of teamLeaders) {
    const hash = await bcrypt.hash('password123', 10);
    const leader = await prisma.user.upsert({
      where: { email: l.email },
      update: { role: 'team_leader', teamName: l.teamName, isActive: true },
      create: {
        organisationId: org.id,
        email: l.email,
        passwordHash: hash,
        fullName: l.fullName,
        role: 'team_leader',
        teamName: l.teamName,
        isActive: true,
      },
    });
    console.log(`✅ Team leader created: ${leader.email} (${l.teamName})`);
  }

  // 9 Steps
  const stepsData = [
    {
      stepNumber: 1,
      name: 'Client Onboarding',
      owningTeamName: 'Intake Team',
      slaDays: 3,
      templates: [
        { title: 'Collect client details', relativeDueDay: 1, sortOrder: 1 },
        { title: 'Collect brand assets', relativeDueDay: 2, sortOrder: 2 },
        { title: 'Send welcome message', relativeDueDay: 1, sortOrder: 3 },
        { title: 'Create client folder', relativeDueDay: 2, sortOrder: 4 },
      ],
    },
    {
      stepNumber: 2,
      name: 'Strategy Call',
      owningTeamName: 'Sales Team',
      slaDays: 5,
      templates: [
        { title: 'Schedule discovery call', relativeDueDay: 1, sortOrder: 1 },
        { title: 'Conduct strategy call', relativeDueDay: 3, sortOrder: 2 },
        { title: 'Define offer and pricing', relativeDueDay: 4, sortOrder: 3 },
        { title: 'Confirm niche and target audience', relativeDueDay: 5, sortOrder: 4 },
      ],
    },
    {
      stepNumber: 3,
      name: 'Brand Setup',
      owningTeamName: 'Design Team',
      slaDays: 7,
      templates: [
        { title: 'Create logo variations', relativeDueDay: 2, sortOrder: 1 },
        { title: 'Define colour palette', relativeDueDay: 2, sortOrder: 2 },
        { title: 'Design social media templates', relativeDueDay: 5, sortOrder: 3 },
        { title: 'Create brand guidelines PDF', relativeDueDay: 7, sortOrder: 4 },
      ],
    },
    {
      stepNumber: 4,
      name: 'Funnel Build',
      owningTeamName: 'Tech Team',
      slaDays: 10,
      templates: [
        { title: 'Set up domain and SSL', relativeDueDay: 2, sortOrder: 1 },
        { title: 'Build landing page', relativeDueDay: 6, sortOrder: 2 },
        { title: 'Configure payment gateway', relativeDueDay: 7, sortOrder: 3 },
        { title: 'Build thank-you page', relativeDueDay: 8, sortOrder: 4 },
        { title: 'Set up registration form', relativeDueDay: 9, sortOrder: 5 },
      ],
    },
    {
      stepNumber: 5,
      name: 'Ad Creative',
      owningTeamName: 'Creative Team',
      slaDays: 7,
      templates: [
        { title: 'Write ad copy variants', relativeDueDay: 2, sortOrder: 1 },
        { title: 'Design static ad creatives', relativeDueDay: 5, sortOrder: 2 },
        { title: 'Produce video ad or reel', relativeDueDay: 7, sortOrder: 3 },
      ],
    },
    {
      stepNumber: 6,
      name: 'Ad Launch',
      owningTeamName: 'Media Buyer',
      slaDays: 5,
      templates: [
        { title: 'Set up Meta ad campaign', relativeDueDay: 1, sortOrder: 1 },
        { title: 'Define targeting and audience', relativeDueDay: 2, sortOrder: 2 },
        { title: 'Set budget and schedule', relativeDueDay: 3, sortOrder: 3 },
        { title: 'Go live and monitor', relativeDueDay: 5, sortOrder: 4 },
      ],
    },
    {
      stepNumber: 7,
      name: 'Automation Setup',
      owningTeamName: 'Automation Team',
      slaDays: 5,
      templates: [
        { title: 'Configure email sequences', relativeDueDay: 2, sortOrder: 1 },
        { title: 'Set up WhatsApp automation', relativeDueDay: 3, sortOrder: 2 },
        { title: 'Configure CRM tagging', relativeDueDay: 5, sortOrder: 3 },
      ],
    },
    {
      stepNumber: 8,
      name: 'Event Preparation',
      owningTeamName: 'Event Team',
      slaDays: 7,
      templates: [
        { title: 'Set up webinar platform', relativeDueDay: 2, sortOrder: 1 },
        { title: 'Create event materials', relativeDueDay: 4, sortOrder: 2 },
        { title: 'Brief the coach', relativeDueDay: 5, sortOrder: 3 },
        { title: 'Conduct dry run', relativeDueDay: 7, sortOrder: 4 },
      ],
    },
    {
      stepNumber: 9,
      name: 'Event Launch',
      owningTeamName: 'Intake Team',
      slaDays: 1,
      templates: [
        { title: 'Execute live event', relativeDueDay: 1, sortOrder: 1 },
        { title: 'Provide real-time support', relativeDueDay: 1, sortOrder: 2 },
        { title: 'Trigger post-event sequence', relativeDueDay: 1, sortOrder: 3 },
      ],
    },
  ];

  const stepMap: Record<number, string> = {};
  for (const s of stepsData) {
    const existing = await prisma.step.findFirst({
      where: { organisationId: org.id, stepNumber: s.stepNumber },
    });
    let step;
    if (existing) {
      step = existing;
    } else {
      step = await prisma.step.create({
        data: {
          organisationId: org.id,
          stepNumber: s.stepNumber,
          name: s.name,
          owningTeamName: s.owningTeamName,
          slaDays: s.slaDays,
          isActive: true,
        },
      });
      for (const t of s.templates) {
        await prisma.stepTaskTemplate.create({
          data: {
            stepId: step.id,
            organisationId: org.id,
            title: t.title,
            relativeDueDay: t.relativeDueDay,
            sortOrder: t.sortOrder,
            priority: 'normal',
          },
        });
      }
    }
    stepMap[s.stepNumber] = step.id;
    console.log(`✅ Step ${s.stepNumber} created: ${s.name}`);
  }

  // Sample clients
  const now = new Date();
  const clients = [
    {
      fullName: 'Priya Sharma',
      brandName: 'Priya Healing Arts',
      email: 'priya@healingarts.in',
      whatsappNumber: '+919876543210',
      stepNumber: 4,
      dateJoined: new Date('2026-04-14'),
    },
    {
      fullName: 'Meera Iyer',
      brandName: 'Mindful with Meera',
      email: 'meera@mindful.in',
      whatsappNumber: '+919876543211',
      stepNumber: 7,
      dateJoined: new Date('2026-04-10'),
    },
  ];

  for (const c of clients) {
    const stepId = stepMap[c.stepNumber];
    const existing = await prisma.client.findFirst({
      where: { organisationId: org.id, email: c.email },
    });
    if (!existing) {
      const stepEnteredAt = new Date(now);
      stepEnteredAt.setDate(stepEnteredAt.getDate() - 14);
      const client = await prisma.client.create({
        data: {
          organisationId: org.id,
          fullName: c.fullName,
          brandName: c.brandName,
          email: c.email,
          whatsappNumber: c.whatsappNumber,
          currentStepId: stepId,
          stepEnteredAt,
          dateJoined: c.dateJoined,
          status: 'active',
          createdById: admin.id,
        },
      });
      console.log(`✅ Client created: ${client.brandName}`);

      // Create step history
      await prisma.stepHistory.create({
        data: {
          organisationId: org.id,
          clientId: client.id,
          toStepId: stepId,
          triggeredBy: 'admin',
          triggeredByUserId: admin.id,
          reasonNote: 'Initial placement',
        },
      });

      // Create sample tasks for the client
      const step = await prisma.step.findUnique({
        where: { id: stepId },
        include: { taskTemplates: { orderBy: { sortOrder: 'asc' } } },
      });
      if (step) {
        const teamMemId = memberMap[step.owningTeamName] || admin.id;
        for (const template of step.taskTemplates) {
          const dueDate = new Date(stepEnteredAt);
          dueDate.setDate(dueDate.getDate() + template.relativeDueDay);
          await prisma.task.create({
            data: {
              organisationId: org.id,
              clientId: client.id,
              stepId: step.id,
              templateTaskId: template.id,
              assignedToId: teamMemId,
              title: template.title,
              priority: template.priority,
              dueDate,
              status: 'pending',
            },
          });
        }
      }
    }
  }

  console.log('\n🎉 Seed complete!\n');
  console.log('Login credentials:');
  console.log('  Admin:        admin@myc.in       / password123');
  console.log('  Team Leader:  lead.<team>@myc.in / password123  (one per team)');
  console.log('  Team Member:  rajan@myc.in       / password123');
  console.log('                 neha@myc.in       / password123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
