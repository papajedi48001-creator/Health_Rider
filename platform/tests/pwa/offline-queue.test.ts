import { expect, test } from 'vitest';
import { OfflineQueue } from '@/pwa/offline-queue';

test('keeps encrypted evidence queued after a failed sync and removes it after acknowledgement', async () => {
  const queue = new OfflineQueue();
  await queue.enqueue({ eventUuid: '11111111-1111-4111-8111-111111111111', attemptId: 'attempt-1', deliveryVersion: 1, eventType: 'picked_up', deviceCapturedAt: '2026-10-01T10:00:00.000Z', payload: { photo: 'local-evidence' } });

  await queue.sync({ send: async () => ({ acknowledged: false }) });
  expect(await queue.pending()).toHaveLength(1);

  await expect(queue.sync({ send: async () => ({ acknowledged: true }) })).resolves.toMatchObject({
    acknowledgedEventUuids: ['11111111-1111-4111-8111-111111111111'],
  });
  expect(await queue.pending()).toHaveLength(0);
});
