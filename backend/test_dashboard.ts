import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgId = (await prisma.organisation.findFirst())?.id;
  
  const timeQuery = async (name: string, query: Promise<any>) => {
    const t = Date.now();
    await query;
    console.log(`${name}: ${Date.now() - t}ms`);
  };

  await Promise.all([
    timeQuery('Clients', prisma.client.findMany({
      where: { organisationId: orgId },
      select: {
        id: true, fullName: true, brandName: true, status: true,
        stepEnteredAt: true, dateJoined: true, createdAt: true,
        currentStep: { select: { id: true, name: true, stepNumber: true, slaDays: true, owningTeamName: true } },
      },
      orderBy: { createdAt: 'desc' },
    })),
    timeQuery('Tasks', prisma.task.findMany({
      where: { organisationId: orgId },
      select: {
        id: true, title: true, status: true, priority: true, dueDate: true,
        completedAt: true, createdAt: true, inProgressAt: true,
        assignedToId: true, stepId: true, clientId: true,
        extensionRequestedDate: true, extensionReason: true,
      },
    })),
    timeQuery('Histories', prisma.stepHistory.findMany({
      where: { organisationId: orgId },
      select: {
        clientId: true, createdAt: true,
        fromStep: { select: { stepNumber: true } },
        toStep: { select: { stepNumber: true } },
      },
      orderBy: { createdAt: 'asc' },
    }))
  ]);
}

main().finally(() => prisma.$disconnect());
