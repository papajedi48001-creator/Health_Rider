import { requireRole, type SessionUser } from '@/auth/require-role';
import { isSameBangkokDay } from '@/lib/time';

type ReturnStore = { findReturnRequiredAttempt(attemptId: string): Promise<{ id: string; status: string; failedAt: Date | null } | null>; update(record: { id: string; status: 'returned'; returnedAt: Date }): Promise<unknown> };

export async function receiveMedicationReturn(attemptId: string, pharmacist: SessionUser | null, store: ReturnStore) {
  requireRole(pharmacist, 'pharmacy', 'admin');
  const attempt = await store.findReturnRequiredAttempt(attemptId);
  if (!attempt || attempt.status !== 'return_required' || !attempt.failedAt) throw new Error('ไม่พบงานที่รอรับยาคืน');
  const now = new Date();
  if (!isSameBangkokDay(attempt.failedAt, now)) throw new Error('ต้องรับยาคืนภายในวันเดียวกัน');
  return store.update({ id: attempt.id, status: 'returned', returnedAt: now });
}
