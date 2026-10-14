import { expect, test } from 'vitest';
import { memoryOfflineEventStore, OfflineQueue } from '@/pwa/offline-queue';

const event = { eventUuid: '11111111-1111-4111-8111-111111111111', attemptId: 'attempt-1', deliveryVersion: 1, eventType: 'picked_up', deviceCapturedAt: '2026-10-01T10:00:00.000Z', payload: { photo: 'local-evidence' } };

test('keeps encrypted evidence queued after a failed sync and removes it after acknowledgement', async () => {
  const queue = new OfflineQueue(memoryOfflineEventStore());
  await queue.enqueue(event);

  await queue.sync({ send: async () => ({ acknowledged: false }) });
  expect(await queue.pending()).toHaveLength(1);

  await queue.sync({ send: async () => { throw new TypeError('Failed to fetch'); } });
  expect(await queue.pending()).toHaveLength(1);

  await expect(queue.sync({ send: async () => ({ acknowledged: true }) })).resolves.toMatchObject({
    acknowledgedEventUuids: ['11111111-1111-4111-8111-111111111111'],
  });
  expect(await queue.pending()).toHaveLength(0);
});

test('sends each stored event once even when sync is triggered twice at the same time', async () => {
  const queue = new OfflineQueue(memoryOfflineEventStore());
  await queue.enqueue(event);
  let sends = 0;
  const client = { send: async () => { sends += 1; return { acknowledged: true }; } };

  await Promise.all([queue.sync(client), queue.sync(client)]);

  expect(sends).toBe(1);
});
