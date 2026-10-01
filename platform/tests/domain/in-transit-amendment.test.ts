import { expect, test } from 'vitest';
import { amendInTransit } from '@/domain/delivery/amend-in-transit';

test('increments version and retains audit old/new values for coordinator amendment', async () => {
  const audits: unknown[] = [];
  const result = await amendInTransit('request-1', { deliveryAddress: 'บ้านใหม่', reason: 'ผู้ป่วยแจ้งแก้ที่อยู่' }, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, {
    findInTransitRequest: async () => ({ id: 'request-1', deliveryVersion: 1, hn: 'HN-1', deliveryAddress: 'บ้านเดิม', telephone: '0800000000' }),
    update: async (record) => record,
    createAudit: async (audit) => { audits.push(audit); return audit; },
  });
  expect(result).toMatchObject({ deliveryVersion: 2, deliveryAddress: 'บ้านใหม่' });
  expect(audits[0]).toMatchObject({ oldValues: { deliveryAddress: 'บ้านเดิม' }, newValues: { deliveryAddress: 'บ้านใหม่' } });
});

test('does not allow HN or package identity to be amended', async () => {
  await expect(amendInTransit('request-1', { hn: 'HN-2', reason: 'wrong' } as never, { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, {} as never)).rejects.toThrow('แก้ไข HN หรือข้อมูลพัสดุไม่ได้');
});
