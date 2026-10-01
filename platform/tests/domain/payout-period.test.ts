import { expect, test } from 'vitest';
import { createPayoutPeriod } from '@/domain/payout/create-period';
import { approvePayoutPeriod } from '@/domain/payout/approve-period';
import { closePayoutPeriod } from '@/domain/payout/close-period';

test('creates payout lines only for delivered attempts with complete proof', async () => {
  const result = await createPayoutPeriod(new Date('2026-10-01'), { id: 'finance-1', role: 'finance', displayName: 'Finance' }, {
    findEligibleAttempts: async () => [{ id: 'attempt-1', riderId: 'rider-1', riderCode: 'R-01', riderName: 'Rider', zoneName: 'หมู่ 1', rateSatang: 2500 }],
    create: async (period) => period,
  });
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0]).toMatchObject({ rateSatang: 2500 });
});

test('finance approval then close makes a payout period immutable', async () => {
  const store = { find: async () => ({ id: 'period-1', status: 'draft' }), update: async (period: unknown) => period };
  await expect(approvePayoutPeriod('period-1', { id: 'finance-1', role: 'finance', displayName: 'Finance' }, store)).resolves.toMatchObject({ status: 'approved' });
  await expect(closePayoutPeriod('period-1', { id: 'finance-1', role: 'finance', displayName: 'Finance' }, { ...store, find: async () => ({ id: 'period-1', status: 'approved' }) })).resolves.toMatchObject({ status: 'closed' });
});
