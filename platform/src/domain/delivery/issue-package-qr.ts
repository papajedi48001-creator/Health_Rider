import { createHash, randomBytes } from 'node:crypto';
import { newPublicId } from '@/domain/delivery/status';

type PackageQrStore = {
  create(record: { id: string; deliveryAttemptId: string; tokenHash: string; expiresAt: Date }): Promise<void>;
};

export async function issuePackageQr(attemptId: string, expiresAt: Date, store: PackageQrStore): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await store.create({
    id: newPublicId(),
    deliveryAttemptId: attemptId,
    tokenHash: hashPackageQrToken(token),
    expiresAt,
  });
  return token;
}

export function hashPackageQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
