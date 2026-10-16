import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '@/lib/prisma-client.mjs';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function client(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

// Created on first use rather than at import, so `next build` can load route modules without a database.
export const db = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const prisma = client();
    const value = Reflect.get(prisma, property);
    return typeof value === 'function' ? value.bind(prisma) : value;
  },
});
