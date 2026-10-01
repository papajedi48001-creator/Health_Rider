import { createHash } from 'node:crypto';

export type ClaimResult =
  | { kind: 'claimed'; attemptId: string }
  | { kind: 'invalid' }
  | { kind: 'conflict' };

type ClaimTransaction = {
  findToken(tokenHash: string): Promise<{ attemptId: string; expiresAt: Date; invalidatedAt: Date | null } | null>;
  claimPreparedAttempt(attemptId: string, riderId: string, claimedAt: Date): Promise<boolean>;
  invalidateToken(attemptId: string): Promise<void>;
};

type ClaimStore = {
  transaction<T>(work: (transaction: ClaimTransaction) => Promise<T>): Promise<T>;
};

export async function claimPackageQr(token: string, riderId: string, claimedAt: Date, store: ClaimStore): Promise<ClaimResult> {
  return store.transaction(async (transaction) => {
    const packageToken = await transaction.findToken(hashPackageQrToken(token));
    if (!packageToken || packageToken.invalidatedAt || packageToken.expiresAt <= claimedAt) {
      return { kind: 'invalid' };
    }

    const claimed = await transaction.claimPreparedAttempt(packageToken.attemptId, riderId, claimedAt);
    if (!claimed) {
      return { kind: 'conflict' };
    }

    await transaction.invalidateToken(packageToken.attemptId);
    return { kind: 'claimed', attemptId: packageToken.attemptId };
  });
}

export function hashPackageQrToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
