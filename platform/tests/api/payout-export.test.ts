import { expect, test } from 'vitest';
import { exportPayoutCsv } from '@/domain/payout/export-csv';

test('exports only approved payout columns', async () => {
  const csv = await exportPayoutCsv([{ riderCode: 'R-01', riderName: 'Rider', attemptId: 'attempt-1', zoneName: 'หมู่ 1', rateSatang: 2500 }]);
  expect(csv).toContain('rider_code,rider_name,attempt_id,zone_name,rate_satang');
  expect(csv).not.toContain('patient');
});
