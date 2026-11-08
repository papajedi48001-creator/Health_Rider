import { expect, test } from 'vitest';
import { claimPackageQr, type ClaimTransaction } from '@/domain/delivery/claim-package-qr';
import { hashPackageQrToken } from '@/domain/delivery/issue-package-qr';

test('returns invalid for an expired package QR', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), {
    transaction: async (work) => work({
      findToken: async () => ({ attemptId: 'attempt-1', expiresAt: new Date('2026-10-01T00:00:00.000Z'), invalidatedAt: null }),
      findTokenByVisitNumber: async () => null,
      claimPreparedAttempt: async () => false,
      invalidateToken: async () => undefined,
      findHolder: async () => null,
    }),
  });

  expect(result).toEqual({ kind: 'invalid' });
});

test('allows exactly one rider to claim the same prepared package', async () => {
  let claimedBy: string | null = null;
  const store = {
    transaction: async <T>(work: (tx: {
      findToken(hash: string): Promise<{ attemptId: string; expiresAt: Date; invalidatedAt: Date | null } | null>;
      findTokenByVisitNumber(visitNumber: string): Promise<null>;
      claimPreparedAttempt(attemptId: string, riderId: string, claimedAt: Date): Promise<boolean>;
      invalidateToken(attemptId: string): Promise<void>;
      findHolder(attemptId: string): Promise<null>;
    }) => Promise<T>) => work({
      findToken: async (hash) => hash === hashPackageQrToken('opaque-token')
        ? { attemptId: 'attempt-1', expiresAt: new Date('2026-10-03T00:00:00.000Z'), invalidatedAt: null }
        : null,
      findTokenByVisitNumber: async () => null,
      claimPreparedAttempt: async (_attemptId, riderId) => {
        if (claimedBy) return false;
        claimedBy = riderId;
        return true;
      },
      invalidateToken: async () => undefined,
      // Both riders scan before either claim is visible, so the loser sees no holder yet.
      findHolder: async () => null,
    }),
  };

  const results = await Promise.all([
    claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), store),
    claimPackageQr('opaque-token', 'rider-2', new Date('2026-10-02T00:00:00.000Z'), store),
  ]);

  expect(results.filter((result) => result.kind === 'claimed')).toHaveLength(1);
  expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
});

function scannedAgain(holder: { riderId: string; riderName: string; status: string } | null) {
  return {
    transaction: async <T>(work: (tx: ClaimTransaction) => Promise<T>) => work({
      findToken: async () => ({ attemptId: 'attempt-1', expiresAt: new Date('2026-10-03T00:00:00.000Z'), invalidatedAt: new Date('2026-10-02T00:00:00.000Z') }),
      findTokenByVisitNumber: async () => null,
      claimPreparedAttempt: async () => false,
      invalidateToken: async () => undefined,
      findHolder: async () => holder,
    }),
  };
}

test('opens the job again when the rider who claimed it scans the same QR', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T01:00:00.000Z'), scannedAgain({ riderId: 'rider-1', riderName: 'ไรเดอร์หนึ่ง', status: 'in_transit' }));
  expect(result).toEqual({ kind: 'already_mine', attemptId: 'attempt-1', finished: false });
});

test('tells the rider a job they already finished is done', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T01:00:00.000Z'), scannedAgain({ riderId: 'rider-1', riderName: 'ไรเดอร์หนึ่ง', status: 'delivered' }));
  expect(result).toEqual({ kind: 'already_mine', attemptId: 'attempt-1', finished: true });
});

test('names the rider who already claimed the package', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-2', new Date('2026-10-02T01:00:00.000Z'), scannedAgain({ riderId: 'rider-1', riderName: 'ไรเดอร์หนึ่ง', status: 'claimed' }));
  expect(result).toEqual({ kind: 'taken', riderName: 'ไรเดอร์หนึ่ง' });
});

test('keeps an old QR invalid after pharmacy reissued it for an unclaimed package', async () => {
  const result = await claimPackageQr('opaque-token', 'rider-1', new Date('2026-10-02T01:00:00.000Z'), scannedAgain(null));
  expect(result).toEqual({ kind: 'invalid' });
});

test('claims the package whose VN the rider typed when the QR cannot be scanned', async () => {
  const lookedUp: string[] = [];
  const result = await claimPackageQr('691020070218', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), {
    transaction: async (work) => work({
      findToken: async () => { throw new Error('a VN is not a QR token'); },
      findTokenByVisitNumber: async (visitNumber) => {
        lookedUp.push(visitNumber);
        return { attemptId: 'attempt-1', expiresAt: new Date('2026-10-03T00:00:00.000Z'), invalidatedAt: null };
      },
      claimPreparedAttempt: async () => true,
      invalidateToken: async () => undefined,
      findHolder: async () => null,
    }),
  });

  expect(lookedUp).toEqual(['691020070218']);
  expect(result).toEqual({ kind: 'claimed', attemptId: 'attempt-1' });
});

test('returns invalid for a VN with no package QR', async () => {
  const result = await claimPackageQr('691020070218', 'rider-1', new Date('2026-10-02T00:00:00.000Z'), {
    transaction: async (work) => work({
      findToken: async () => null,
      findTokenByVisitNumber: async () => null,
      claimPreparedAttempt: async () => false,
      invalidateToken: async () => undefined,
      findHolder: async () => null,
    }),
  });

  expect(result).toEqual({ kind: 'invalid' });
});
