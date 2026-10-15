import { expect, test } from 'vitest';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { syncOfflineEvent, type OfflineDeliveryEventInput, type OfflineEventStore } from '@/domain/delivery/sync-offline-event';

const rider = { id: 'rider-1', role: 'rider' as const, displayName: 'Rider' };

function memoryStore(status: DeliveryAttemptStatus, deliveryVersion = 1) {
  const state = { status, events: [] as unknown[], evidence: [] as unknown[], conflicts: [] as unknown[], audits: [] as unknown[] };
  const store: OfflineEventStore = {
    findByUuid: async (eventUuid) => state.events.find((event) => (event as { eventUuid: string }).eventUuid === eventUuid) ?? null,
    lockRiderAttempt: async (attemptId, riderId) => (riderId === rider.id ? { id: attemptId, status: state.status, deliveryVersion } : null),
    createEvent: async (event) => { state.events.push(event); return { id: `event-${state.events.length}` }; },
    updateAttempt: async (_id, update) => { state.status = update.status; },
    createEvidence: async (record) => { state.evidence.push(record); },
    createConflict: async (record) => { state.conflicts.push(record); },
    createAudit: async (audit) => { state.audits.push(audit); },
  };
  return { state, store };
}

function event(overrides: Partial<OfflineDeliveryEventInput>): OfflineDeliveryEventInput {
  return { eventUuid: '11111111-1111-4111-8111-111111111111', attemptId: 'attempt-1', deliveryVersion: 1, deviceCapturedAt: new Date('2026-10-14T03:00:00.000Z'), details: { eventType: 'picked_up' }, photoPath: null, ...overrides };
}

test('records an offline event only once for the same rider UUID', async () => {
  const { state, store } = memoryStore('claimed');
  await expect(syncOfflineEvent(event({}), rider, store)).resolves.toEqual({ kind: 'applied', status: 'in_transit' });
  await expect(syncOfflineEvent(event({}), rider, store)).resolves.toEqual({ kind: 'duplicate' });
  expect(state.events).toHaveLength(1);
});

test('marks a delivery successful with its evidence and an audit entry', async () => {
  const { state, store } = memoryStore('in_transit');
  await syncOfflineEvent(event({ details: { eventType: 'delivered', recipientRelation: 'child' }, photoPath: 'attempt-1/x.jpg' }), rider, store);
  expect(state.status).toBe('delivered');
  expect(state.evidence).toEqual([expect.objectContaining({ recipientRelation: 'child', photoPath: 'attempt-1/x.jpg' })]);
  expect(state.audits).toEqual([expect.objectContaining({ action: 'delivery_attempt.delivered' })]);
});

test('keeps an event recorded before an amendment and sends it to review', async () => {
  const { state, store } = memoryStore('in_transit', 2);
  await expect(syncOfflineEvent(event({ details: { eventType: 'delivered', recipientRelation: 'self' }, photoPath: 'attempt-1/x.jpg' }), rider, store))
    .resolves.toEqual({ kind: 'conflict', reason: 'version_mismatch' });
  expect(state.status).toBe('sync_review');
  expect(state.events).toHaveLength(1);
  expect(state.evidence).toHaveLength(0);
  expect(state.conflicts).toEqual([expect.objectContaining({ reason: 'version_mismatch', previousStatus: 'in_transit' })]);
});

test('refuses a delivery without a photo and another rider\'s attempt', async () => {
  const { store } = memoryStore('in_transit');
  await expect(syncOfflineEvent(event({ details: { eventType: 'delivered', recipientRelation: 'self' } }), rider, store)).rejects.toThrow('ต้องมีรูปหลักฐานการส่ง');
  await expect(syncOfflineEvent(event({}), { ...rider, id: 'rider-2' }, store)).rejects.toThrow('ไม่พบงานจัดส่ง');
});

test('does not reopen a finished delivery or ask for a photo, but keeps a trace in the audit trail', async () => {
  for (const status of ['delivered', 'returned'] as const) {
    const { state, store } = memoryStore(status);
    await expect(syncOfflineEvent(event({ eventUuid: '22222222-2222-4222-8222-222222222222', details: { eventType: 'delivered', recipientRelation: 'self' } }), rider, store))
      .resolves.toEqual({ kind: 'rejected' });
    expect(state.status).toBe(status);
    expect(state.events).toHaveLength(0);
    expect(state.evidence).toHaveLength(0);
    expect(state.audits).toEqual([expect.objectContaining({ action: 'delivery_attempt.event_rejected' })]);
  }
});
