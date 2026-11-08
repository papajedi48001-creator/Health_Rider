import type { Prisma } from '@prisma/client';
import type { SessionUser } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';

// A coordinator looks after the riders of their own รพ.สต. only; pharmacy (the district coordinator) and admins see
// every job. Jobs no rider has claimed yet belong to pharmacy, so a coordinator does not see them either.
export function attemptScope(viewer: SessionUser): Prisma.DeliveryAttemptWhereInput {
  if (viewer.role !== 'coordinator') return {};
  // Without a รพ.สต. of their own a coordinator sees nothing until one is chosen.
  return viewer.healthCenter ? { rider: { healthCenter: viewer.healthCenter } } : { id: { in: [] } };
}

export function scoped(viewer: SessionUser, where: Prisma.DeliveryAttemptWhereInput): Prisma.DeliveryAttemptWhereInput {
  return viewer.role === 'coordinator' ? { AND: [where, attemptScope(viewer)] } : where;
}

type AttemptCounter = { deliveryAttempt: { count(args: { where: Prisma.DeliveryAttemptWhereInput }): Promise<number> } };

// Answers "not found" for a job outside the coordinator's area, so its existence is not revealed.
export async function requireAttemptInScope(store: AttemptCounter, viewer: SessionUser, where: Prisma.DeliveryAttemptWhereInput, message = 'ไม่พบงานนี้'): Promise<void> {
  if (viewer.role !== 'coordinator') return;
  if ((await store.deliveryAttempt.count({ where: scoped(viewer, where) })) === 0) throw new DomainError(message, 404);
}
