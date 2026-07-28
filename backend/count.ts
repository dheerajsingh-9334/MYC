import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log(await prisma.stepHistory.count());
  console.log(await prisma.task.count());
}
main().finally(() => prisma.$disconnect());
