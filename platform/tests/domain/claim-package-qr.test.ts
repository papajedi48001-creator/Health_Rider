import { expect, test } from 'vitest';
import { claimPackageQr, hashPackageQrToken } from '@/domain/delivery/claim-package-qr';

test('returns invalid for an expired package QR', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), {
    transaction: async (work) => work({
      findToken: async () => ({ attemptId: 'attempt-1', expiresAt: new Date('2026-10-01T00:00:00.000Z'), invalidatedAt: null }),
      claimPreparedAttempt: async () => false,
      invalidateToken: async () => undefined,
    }),
  });

  expect(result).toEqual({ kind: 'invalid' });
});

test('allows exactly one rider to claim the same prepared package', async () => {
  let claimedBy: string | null = null;
  const store = {
    transaction: async <T>(work: (tx: {
      findToken(hash: string): Promise<{ attemptId: string; expiresAt: Date; invalidatedAt: Date | null } | null>;
      claimPreparedAttempt(attemptId: string, riderId: string, claimedAt: Date): Promise<boolean>;
      invalidateToken(attemptId: string): Promise<void>;
    }) => Promise<T>) => work({
      findToken: async (hash) => hash === hashPackageQrToken('opaque-token')
        ? { attemptId: 'attempt-1', expiresAt: new Date('2026-10-03T00:00:00.000Z'), invalidatedAt: null }
        : null,
      claimPreparedAttempt: async (_attemptId, riderId) => {
        if (claimedBy) return false;
        claimedBy = riderId;
        return true;
      },
      invalidateToken: async () => undefined,
    }),
  };

  const results = await Promise.all([
    claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), store),
    claimPackageQr('opaque-token', 'rider-2', new Date('2026-10-02T00:00:00.000Z'), store),
  ]);

  expect(results.filter((result) => result.kind === 'claimed')).toHaveLength(1);
  expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
});
