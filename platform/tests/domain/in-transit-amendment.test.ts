import { expect, test } from 'vitest';
import { amendInTransit, StaleDeliveryVersionError } from '@/domain/delivery/amend-in-transit';

test('increments version and retains audit old/new values for coordinator amendment', async () => {
  const audits: unknown[] = [];
  const result = await amendInTransit('request-1', { deliveryAddress: 'บ้านใหม่', reason: 'ผู้ป่วยแจ้งแก้ที่อยู่', expectedVersion: 1 }, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, {
    findInTransitRequest: async () => ({ id: 'request-1', deliveryVersion: 1, hn: 'HN-1', deliveryAddress: 'บ้านเดิม', telephone: '0800000000' }),
    update: async () => true,
    createAudit: async (audit) => { audits.push(audit); return audit; },
  });
  expect(result).toMatchObject({ deliveryVersion: 2, deliveryAddress: 'บ้านใหม่' });
  expect(audits[0]).toMatchObject({ oldValues: { deliveryAddress: 'บ้านเดิม', deliveryVersion: 1 }, newValues: { deliveryAddress: 'บ้านใหม่', deliveryVersion: 2 } });
});

test('does not allow HN or package identity to be amended', async () => {
  await expect(amendInTransit('request-1', { hn: 'HN-2', reason: 'wrong' } as never, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, {} as never)).rejects.toThrow('แก้ไข HN หรือข้อมูลพัสดุไม่ได้');
});

test('rejects an amendment made against an older delivery version', async () => {
  const store = {
    findInTransitRequest: async () => ({ id: 'request-1', deliveryVersion: 3, hn: 'HN-1', deliveryAddress: 'บ้านเดิม', telephone: null }),
    update: async () => true,
    createAudit: async () => undefined,
  };
  await expect(amendInTransit('request-1', { telephone: '0811111111', reason: 'แก้เบอร์', expectedVersion: 2 }, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, store))
    .rejects.toThrow(StaleDeliveryVersionError);
  await expect(amendInTransit('request-1', { telephone: '0811111111', reason: 'แก้เบอร์', expectedVersion: 3 }, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, { ...store, update: async () => false }))
    .rejects.toThrow(StaleDeliveryVersionError);
});
