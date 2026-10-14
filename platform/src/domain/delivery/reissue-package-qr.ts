import { requireRole, type SessionUser } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

type ReissueStore = {
  findAttempt(attemptId: string): Promise<{ id: string; status: DeliveryAttemptStatus } | null>;
  invalidateTokens(attemptId: string, at: Date): Promise<unknown>;
  createToken(record: { id: string; deliveryAttemptId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
};

// Only the hash of a QR token is stored, so a lost or expired label is replaced rather than reprinted.
export async function reissuePackageQr(attemptId: string, expiresAt: Date, pharmacist: SessionUser | null, store: ReissueStore): Promise<string> {
  requireRole(pharmacist, 'pharmacy', 'admin');
  const attempt = await store.findAttempt(attemptId);
  if (!attempt || attempt.status !== 'prepared') throw new DomainError('ออก QR ใหม่ได้เฉพาะพัสดุที่ยังไม่มีไรเดอร์รับงาน');
  await store.invalidateTokens(attempt.id, new Date());
  return issuePackageQr(attempt.id, expiresAt, { create: store.createToken });
}
