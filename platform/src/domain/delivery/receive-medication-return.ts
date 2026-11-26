import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';
import { isSameBangkokDay } from '@/lib/time';

type ReturnStore = { findReturnRequiredAttempt(attemptId: string): Promise<{ id: string; status: string; failedAt: Date | null } | null>; update(record: { id: string; status: 'returned'; returnedAt: Date }): Promise<unknown> };

// The medication should come back on the same Thai calendar day as the failed attempt.
// A late return is still recorded (refusing it would leave the job stuck in "รอรับยาคืน" forever),
// but it is flagged as late so the audit log and the caller can show that the rule was missed.
export async function receiveMedicationReturn(attemptId: string, pharmacist: SessionUser | null, store: ReturnStore, now: Date = new Date()) {
  requireRole(pharmacist, 'pharmacy', 'coordinator', 'admin');
  const attempt = await store.findReturnRequiredAttempt(attemptId);
  if (!attempt || attempt.status !== 'return_required' || !attempt.failedAt) throw new DomainError('ไม่พบงานที่รอรับยาคืน');
  const late = !isSameBangkokDay(attempt.failedAt, now);
  await store.update({ id: attempt.id, status: 'returned', returnedAt: now });
  return { id: attempt.id, status: 'returned' as const, returnedAt: now, late };
}
