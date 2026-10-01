import { requireRole, type SessionUser } from '@/auth/require-role';
import { newPublicId } from '@/domain/delivery/status';

type EligibleAttempt = { id: string; riderId: string; riderCode: string; riderName: string; zoneName: string; rateSatang: number };
type PayoutPeriod = { id: string; month: Date; status: 'draft'; createdById: string; lines: Array<EligibleAttempt & { id: string }> };
type PayoutStore = { findEligibleAttempts(month: Date): Promise<EligibleAttempt[]>; create(period: PayoutPeriod): Promise<PayoutPeriod> };

export async function createPayoutPeriod(month: Date, financeUser: SessionUser | null, store: PayoutStore): Promise<PayoutPeriod> {
  const finance = requireRole(financeUser, 'finance', 'admin');
  const attempts = await store.findEligibleAttempts(month);
  return store.create({ id: newPublicId(), month, status: 'draft', createdById: finance.id, lines: attempts.map((attempt) => ({ ...attempt, id: newPublicId() })) });
}
