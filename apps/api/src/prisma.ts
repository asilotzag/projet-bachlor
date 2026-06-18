import { PrismaClient } from '@prisma/client';

/**
 * Client Prisma partagé (singleton) pour éviter d'ouvrir plusieurs connexions
 * lors du rechargement à chaud en développement.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
