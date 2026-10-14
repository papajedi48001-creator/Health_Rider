import { Prisma, type PrismaClient } from '@prisma/client';
import { newPublicId } from '@/domain/delivery/status';

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

type AuditClient = { auditEvent: Pick<PrismaClient['auditEvent'], 'create'> };

// Shorthand used inside the same transaction as the change being audited.
export async function audit(
  client: AuditClient,
  event: Omit<AuditEventInput, 'id' | 'reason' | 'oldValues' | 'newValues'> & {
    reason?: string | null;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
  },
): Promise<unknown> {
  return writeAuditEvent(client.auditEvent as PrismaClient['auditEvent'], {
    ...event,
    id: newPublicId(),
    reason: event.reason ?? null,
    oldValues: (event.oldValues ?? null) as Prisma.InputJsonValue | null,
    newValues: (event.newValues ?? null) as Prisma.InputJsonValue | null,
  });
}
