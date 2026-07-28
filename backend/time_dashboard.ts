import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgId = (await prisma.organisation.findFirst())?.id;
  if (!orgId) return console.log("No org");
  
  console.time("Tasks");
  await prisma.task.findMany({ where: { organisationId: orgId }, select: { id: true, assignedTo: { select: { id: true } }, step: { select: { id: true } }, client: { select: { id: true } }, completedBy: { select: { id: true } } } });
  console.timeEnd("Tasks");

  console.time("Clients");
  await prisma.client.findMany({ where: { organisationId: orgId }, select: { id: true, currentStep: { select: { id: true } }, stepHistory: { select: { id: true }, take: 1 } } });
  console.timeEnd("Clients");

  console.time("Histories");
  await prisma.stepHistory.findMany({ where: { organisationId: orgId }, select: { id: true, fromStep: { select: { id: true } }, toStep: { select: { id: true } } } });
  console.timeEnd("Histories");
}
main().finally(() => prisma.$disconnect());
