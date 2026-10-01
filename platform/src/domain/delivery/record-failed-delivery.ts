import { requireRole, type SessionUser } from '@/auth/require-role';

export const failedDeliveryReasons = ['recipient_unavailable', 'address_not_found', 'recipient_declined', 'unsafe_to_deliver'] as const;
type FailedDeliveryReason = (typeof failedDeliveryReasons)[number];
type FailureStore = { findClaimedAttempt(attemptId: string, riderId: string): Promise<{ id: string; status: string } | null>; update(record: { id: string; status: 'return_required'; failureReason: FailedDeliveryReason; failedAt: Date }): Promise<unknown> };

export async function recordFailedDelivery(attemptId: string, data: { reason: FailedDeliveryReason }, rider: SessionUser | null, store: FailureStore) {
  const actor = requireRole(rider, 'rider');
  if (!failedDeliveryReasons.includes(data.reason)) throw new Error('เหตุผลการส่งไม่สำเร็จไม่ถูกต้อง');
  const attempt = await store.findClaimedAttempt(attemptId, actor.id);
  if (!attempt || !['claimed', 'in_transit'].includes(attempt.status)) throw new Error('ไม่สามารถบันทึกการส่งไม่สำเร็จสำหรับงานนี้');
  return store.update({ id: attempt.id, status: 'return_required', failureReason: data.reason, failedAt: new Date() });
}
