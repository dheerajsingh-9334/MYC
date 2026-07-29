const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  let t0 = Date.now();
  await prisma.client.findFirst();
  console.log("Warmup time:", Date.now() - t0);

  t0 = Date.now();
  const [clients, tasks, histories] = await prisma.$transaction([
    prisma.client.findMany({ select: { id: true } }),
    prisma.task.findMany({ select: { id: true } }),
    prisma.stepHistory.findMany({ select: { id: true } })
  ]);
  console.log("Transaction time:", Date.now() - t0);

  t0 = Date.now();
  const [c2, t2, h2] = await Promise.all([
    prisma.client.findMany({ select: { id: true } }),
    prisma.task.findMany({ select: { id: true } }),
    prisma.stepHistory.findMany({ select: { id: true } })
  ]);
  console.log("Promise.all time:", Date.now() - t0);
}

run().finally(() => prisma.$disconnect());
