import { expect, test } from 'vitest';
import { resolveSyncConflict } from '@/domain/delivery/resolve-sync-conflict';

test('resolves a sync conflict without deleting supplied evidence', async () => {
  const result = await resolveSyncConflict('conflict-1', 'ยืนยันหลักฐานและส่งให้ประสานงาน', { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, {
    findPending: async () => ({ id: 'conflict-1', offlineDeliveryEventId: 'event-1', status: 'pending' }),
    update: async (record) => record,
  });
  expect(result).toMatchObject({ id: 'conflict-1', status: 'resolved', resolution: 'ยืนยันหลักฐานและส่งให้ประสานงาน' });
});
