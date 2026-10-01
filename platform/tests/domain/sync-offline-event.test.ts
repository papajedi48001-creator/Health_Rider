import { expect, test } from 'vitest';
import { syncOfflineEvent } from '@/domain/delivery/sync-offline-event';

test('records an offline event only once for the same rider UUID', async () => {
  const events: unknown[] = [];
  const store = { findByUuid: async () => events[0] ?? null, create: async (event: unknown) => { events.push(event); return event; } };
  const event = { eventUuid: '11111111-1111-4111-8111-111111111111', attemptId: 'attempt-1', deliveryVersion: 1, eventType: 'picked_up', deviceCapturedAt: '2026-10-01T10:00:00.000Z', payload: {} };
  await syncOfflineEvent(event, { id: 'rider-1', role: 'rider', displayName: 'Rider' }, store);
  const duplicate = await syncOfflineEvent(event, { id: 'rider-1', role: 'rider', displayName: 'Rider' }, store);
  expect(events).toHaveLength(1);
  expect(duplicate).toEqual({ kind: 'duplicate' });
});
