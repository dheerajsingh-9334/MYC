import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const orgId = 'mock'; // skip query
  console.log('Testing transaction connection usage...');
}
