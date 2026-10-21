import { hashPackageQrToken } from '@/domain/delivery/issue-package-qr';

export type ClaimResult =
  | { kind: 'claimed'; attemptId: string }
  | { kind: 'already_mine'; attemptId: string; finished: boolean }
  | { kind: 'taken'; riderName: string }
  | { kind: 'invalid' }
  | { kind: 'conflict' };

// Who holds the package now; null while no rider has claimed it.
export type PackageHolder = { riderId: string; riderName: string; status: string };

type PackageToken = { attemptId: string; expiresAt: Date; invalidatedAt: Date | null };

export type ClaimTransaction = {
  findToken(tokenHash: string): Promise<PackageToken | null>;
  // The newest QR issued for the package with this HOSxP visit number.
  findTokenByVisitNumber(visitNumber: string): Promise<PackageToken | null>;
  claimPreparedAttempt(attemptId: string, riderId: string, claimedAt: Date): Promise<boolean>;
  invalidateToken(attemptId: string): Promise<void>;
  findHolder(attemptId: string): Promise<PackageHolder | null>;
};

type ClaimStore = {
  transaction<T>(work: (transaction: ClaimTransaction) => Promise<T>): Promise<T>;
};

// A rider whose camera cannot read the QR types the VN printed on the label instead of the QR token.
export function isVisitNumber(code: string): boolean {
  return /^\d{1,20}$/.test(code);
}

const unfinishedStatuses = new Set(['claimed', 'in_transit', 'sync_review', 'return_required']);

export async function claimPackageQr(code: string, riderId: string, claimedAt: Date, store: ClaimStore): Promise<ClaimResult> {
  return store.transaction(async (transaction) => {
    const packageToken = isVisitNumber(code)
      ? await transaction.findTokenByVisitNumber(code)
      : await transaction.findToken(hashPackageQrToken(code));
    if (!packageToken) return { kind: 'invalid' };

    // A QR scanned again after the package was claimed says who has it instead of calling the QR invalid.
    const alreadyClaimed = async (): Promise<ClaimResult | null> => {
      const holder = await transaction.findHolder(packageToken.attemptId);
      if (!holder) return null;
      if (holder.riderId === riderId) return { kind: 'already_mine', attemptId: packageToken.attemptId, finished: !unfinishedStatuses.has(holder.status) };
      return { kind: 'taken', riderName: holder.riderName };
    };

    if (packageToken.invalidatedAt || packageToken.expiresAt <= claimedAt) {
      return (await alreadyClaimed()) ?? { kind: 'invalid' };
    }

    const claimed = await transaction.claimPreparedAttempt(packageToken.attemptId, riderId, claimedAt);
    if (!claimed) {
      return (await alreadyClaimed()) ?? { kind: 'conflict' };
    }

    await transaction.invalidateToken(packageToken.attemptId);
    return { kind: 'claimed', attemptId: packageToken.attemptId };
  });
}
