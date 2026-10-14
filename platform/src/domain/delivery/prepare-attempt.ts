import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';
import { newPublicId, type DeliveryAttemptStatus } from '@/domain/delivery/status';

export type PreparedAttempt = {
  id: string;
  deliveryRequestId: string;
  status: DeliveryAttemptStatus;
};

type PreparationStore = {
  findRequest(deliveryRequestId: string): Promise<{ id: string; latestAttemptStatus: DeliveryAttemptStatus | null } | null>;
  createAttempt(record: PreparedAttempt): Promise<PreparedAttempt>;
};

// A request gets its first attempt, or a retry only after pharmacy has received the medication back.
export async function prepareAttempt(
  deliveryRequestId: string,
  pharmacist: SessionUser | null,
  store: PreparationStore,
): Promise<PreparedAttempt> {
  requireRole(pharmacist, 'pharmacy', 'admin');
  const request = await store.findRequest(deliveryRequestId);
  if (!request) throw new DomainError('ไม่พบงานจัดส่งที่ต้องเตรียม');
  if (request.latestAttemptStatus !== null && request.latestAttemptStatus !== 'returned') {
    throw new DomainError('งานนี้มีพัสดุที่ยังดำเนินการอยู่ ต้องรับยาคืนก่อนเตรียมพัสดุใหม่');
  }
  return store.createAttempt({ id: newPublicId(), deliveryRequestId, status: 'prepared' });
}
