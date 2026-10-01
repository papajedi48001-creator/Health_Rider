import { expect, test } from 'vitest';
import { confirmCandidate } from '@/domain/delivery/confirm-candidate';

const candidate = {
  visitNumber: 'VN-TEST-001',
  hn: 'HN-TEST-001',
  patientName: 'ผู้ป่วยทดสอบ',
  patientAge: 64,
  telephone: '0800000000',
  deliveryAddress: 'บ้านทดสอบ หมู่ 1',
  subdistrictCode: '46',
  villageCode: '01',
};

test('creates a delivery request only after pharmacy confirmation and snapshots the rate', async () => {
  const created: unknown[] = [];

  const result = await confirmCandidate(candidate, { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, {
    findZone: async () => ({ id: 'zone-1' }),
    resolveRate: async () => ({ satang: 2500, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') }),
    createRequest: async (request) => {
      created.push(request);
      return request;
    },
  });

  expect(created).toHaveLength(1);
  expect(result).toMatchObject({ hn: 'HN-TEST-001', rateSatangSnapshot: 2500, createdById: 'pharmacy-1' });
});
