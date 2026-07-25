import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany({
    include: { clientServices: true, currentStep: true }
  });

  for (const client of clients) {
    if (client.clientServices.length === 0 && client.serviceId && client.currentStepId) {
      console.log(`Migrating client ${client.id} with service ${client.serviceId}`);
      await prisma.clientService.create({
        data: {
          clientId: client.id,
          serviceId: client.serviceId,
          currentStepId: client.currentStepId,
          stepEnteredAt: client.stepEnteredAt,
          status: client.status,
        }
      });
    }
  }
  console.log('Migration done');
}

main().catch(console.error).finally(() => prisma.$disconnect());
