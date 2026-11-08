import { requireRole, type SessionUser } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';
import { hashPackageQrToken } from '@/domain/delivery/issue-package-qr';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

type ReprintStore = {
  findToken(tokenHash: string): Promise<{
    deliveryAttemptId: string; expiresAt: Date; invalidatedAt: Date | null; attemptStatus: DeliveryAttemptStatus;
  } | null>;
};

// The server keeps only the hash of a QR token, so a reprint needs the token the pharmacy browser kept when it was issued.
// The label is reprinted only while that QR can still be claimed, so a reprint never puts a dead QR on a package.
export async function checkReprintToken(attemptId: string, token: string, now: Date, pharmacist: SessionUser | null, store: ReprintStore): Promise<void> {
  requireRole(pharmacist, 'pharmacy', 'admin');
  const record = token ? await store.findToken(hashPackageQrToken(token)) : null;
  if (!record || record.deliveryAttemptId !== attemptId) throw new DomainError('ไม่พบ QR เดิมของพัสดุนี้ กด "ออก QR ใหม่" แทน');
  if (record.attemptStatus !== 'prepared') throw new DomainError('พิมพ์ซ้ำได้เฉพาะพัสดุที่ยังไม่มีไรเดอร์รับงาน');
  if (record.invalidatedAt || record.expiresAt <= now) throw new DomainError('QR เดิมใช้ไม่ได้แล้ว กด "ออก QR ใหม่" แทน');
}
