import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let datasourceUrl = process.env.DATABASE_URL;
if (datasourceUrl) {
  try {
    const urlObj = new URL(datasourceUrl);
    if (!urlObj.searchParams.has('connection_limit')) {
      urlObj.searchParams.set('connection_limit', '20');
    }
    if (!urlObj.searchParams.has('pool_timeout')) {
      urlObj.searchParams.set('pool_timeout', '30');
    }
    datasourceUrl = urlObj.toString();
  } catch (err) {
    // Ignore invalid URL, Prisma will throw its own error
  }
}

const prisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : ['error'],
  datasources: datasourceUrl ? { db: { url: datasourceUrl } } : undefined,
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
