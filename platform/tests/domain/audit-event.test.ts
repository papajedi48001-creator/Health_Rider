import { expect, test } from 'vitest';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';

test('persists the actor, reason, and before-after values of a mutation', async () => {
  const events: unknown[] = [];
  const auditEvents = {
    create: async ({ data }: { data: unknown }) => {
      events.push(data);
      return data;
    },
  };

  await writeAuditEvent(auditEvents, {
    id: '01J00000000000000000000000',
    actorId: '01J00000000000000000000001',
    action: 'delivery.request.amended',
    auditableType: 'DeliveryRequest',
    auditableId: '01J00000000000000000000002',
    reason: 'แก้ไขบ้านเลขที่ตามการยืนยันทางโทรศัพท์',
    oldValues: { address: 'บ้านเลขที่ 1' },
    newValues: { address: 'บ้านเลขที่ 2' },
  });

  expect(events).toEqual([
    {
      id: '01J00000000000000000000000',
      actorId: '01J00000000000000000000001',
      action: 'delivery.request.amended',
      auditableType: 'DeliveryRequest',
      auditableId: '01J00000000000000000000002',
      reason: 'แก้ไขบ้านเลขที่ตามการยืนยันทางโทรศัพท์',
      oldValues: { address: 'บ้านเลขที่ 1' },
      newValues: { address: 'บ้านเลขที่ 2' },
    },
  ]);
});
