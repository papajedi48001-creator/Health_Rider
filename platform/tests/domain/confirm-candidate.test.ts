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

test('creates a delivery request for the matched delivery zone without monetary data', async () => {
  const created: unknown[] = [];

  const result = await confirmCandidate(candidate, { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, {
    findZone: async () => ({ id: 'zone-1' }),
    createRequest: async (request) => {
      created.push(request);
      return request;
    },
  });

  expect(created).toHaveLength(1);
  expect(result).toMatchObject({ hn: 'HN-TEST-001', deliveryZoneId: 'zone-1', createdById: 'pharmacy-1' });
  expect(result).not.toHaveProperty('rateSatangSnapshot');
  expect(result).not.toHaveProperty('rateEffectiveOn');
});

test('rejects confirmation when the candidate address has no delivery zone', async () => {
  await expect(confirmCandidate(candidate, { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, {
    findZone: async () => null,
    createRequest: async (request) => request,
  })).rejects.toThrow('ไม่พบโซนจัดส่งสำหรับที่อยู่ผู้ป่วย');
});
