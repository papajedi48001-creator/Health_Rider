import { Prisma, type PrismaClient } from '@prisma/client';

export type AuditEventInput = {
  id: string;
  actorId: string;
  action: string;
  auditableType: string;
  auditableId: string;
  reason: string | null;
  oldValues: Prisma.InputJsonValue | null;
  newValues: Prisma.InputJsonValue | null;
};

export async function writeAuditEvent(
  store: PrismaClient['auditEvent'],
  input: AuditEventInput,
): Promise<unknown> {
  return store.create({
    data: {
      ...input,
      oldValues: input.oldValues ?? Prisma.JsonNull,
      newValues: input.newValues ?? Prisma.JsonNull,
    },
  });
}
