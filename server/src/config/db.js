import { PrismaClient } from '@prisma/client';
import { logger } from './logger.js';
import { env } from './env.js';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error']
  });
};

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// Ensure Prisma client singleton is reused across all environments (including serverless production)
globalForPrisma.prisma = prisma;

export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    logger.info('✅ PostgreSQL connected successfully via Prisma');
  } catch (err) {
    logger.error({ err }, '❌ PostgreSQL connection failed');
    throw err;
  }
};
