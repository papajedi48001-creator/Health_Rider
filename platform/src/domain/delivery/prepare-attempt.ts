import { requireRole, type SessionUser } from '@/auth/require-role';
import { newPublicId } from '@/domain/delivery/status';
import type { DeliveryAttemptStatus } from '@prisma/client';

export type PreparedAttempt = {
  id: string;
  deliveryRequestId: string;
  status: DeliveryAttemptStatus;
};

type PreparationStore = {
  createAttempt(record: PreparedAttempt): Promise<PreparedAttempt>;
};

export async function prepareAttempt(
  deliveryRequestId: string,
  pharmacist: SessionUser | null,
  store: PreparationStore,
): Promise<PreparedAttempt> {
  requireRole(pharmacist, 'pharmacy', 'admin');
  return store.createAttempt({ id: newPublicId(), deliveryRequestId, status: 'prepared' });
}
