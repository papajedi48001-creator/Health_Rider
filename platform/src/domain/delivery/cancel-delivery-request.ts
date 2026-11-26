import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

type CancelStore = {
  findRequest(id: string): Promise<{ id: string; cancelledAt: Date | null; latestAttemptStatus: DeliveryAttemptStatus | null } | null>;
  markCancelled(id: string, at: Date): Promise<unknown>;
};

// A job with delivery history cannot be deleted, so pharmacy cancels it instead. Only while it sits on "เตรียมพัสดุ"
// after the medication came back: no live package exists, so no rider or QR can still act on it.
export async function cancelDeliveryRequest(requestId: string, pharmacist: SessionUser | null, store: CancelStore, now: Date = new Date()) {
  requireRole(pharmacist, 'pharmacy', 'admin');
  const found = await store.findRequest(requestId);
  if (!found) throw new DomainError('ไม่พบงานจัดส่งนี้', 404);
  if (found.cancelledAt) throw new DomainError('งานนี้ถูกยกเลิกแล้ว', 409);
  if (found.latestAttemptStatus !== 'returned') {
    throw new DomainError(found.latestAttemptStatus === null || found.latestAttemptStatus === 'prepared'
      ? 'งานนี้ยังไม่มีประวัติการจัดส่ง ใช้ปุ่มลบแทน'
      : 'ยกเลิกได้เฉพาะงานที่รับยาคืนแล้วและยังไม่ได้เตรียมพัสดุใหม่', 409);
  }
  await store.markCancelled(found.id, now);
  return { id: found.id, cancelledAt: now, latestAttemptStatus: found.latestAttemptStatus };
}
