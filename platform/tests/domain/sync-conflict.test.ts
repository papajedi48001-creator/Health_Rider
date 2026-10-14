import { expect, test } from 'vitest';
import { resolveSyncConflict } from '@/domain/delivery/resolve-sync-conflict';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

const coordinator = { id: 'coordinator-1', role: 'coordinator' as const, displayName: 'Coordinator' };

function memoryStore(eventType: string, payload: Record<string, unknown>, otherPending = 0) {
  const state = { status: 'sync_review' as DeliveryAttemptStatus, conflict: null as unknown, evidence: [] as unknown[] };
  return {
    state,
    store: {
      findPending: async (id: string) => ({ id, status: 'pending', deliveryAttemptId: 'attempt-1', previousStatus: 'in_transit' as const, event: { eventType, payload, deviceCapturedAt: new Date() } }),
      otherPendingCount: async () => otherPending,
      updateConflict: async (record: unknown) => { state.conflict = record; },
      updateAttempt: async (_id: string, update: { status: DeliveryAttemptStatus }) => { state.status = update.status; },
      createEvidence: async (record: unknown) => { state.evidence.push(record); },
      createAudit: async () => undefined,
    },
  };
}

test('accepting a retained delivery completes it with the original evidence', async () => {
  const { state, store } = memoryStore('delivered', { recipientRelation: 'self', photoPath: 'attempt-1/x.jpg' });
  await expect(resolveSyncConflict('conflict-1', 'accept', 'โทรยืนยันกับผู้ป่วยแล้ว', coordinator, store)).resolves.toMatchObject({ status: 'delivered' });
  expect(state.evidence).toEqual([expect.objectContaining({ photoPath: 'attempt-1/x.jpg' })]);
  expect(state.conflict).toMatchObject({ status: 'resolved', outcome: 'accept', resolvedById: 'coordinator-1' });
});

test('dismissing keeps the event as evidence and restores the previous status', async () => {
  const { state, store } = memoryStore('delivered', { recipientRelation: 'self', photoPath: 'attempt-1/x.jpg' });
  await resolveSyncConflict('conflict-1', 'dismiss', 'ที่อยู่ผิด ให้ส่งใหม่', coordinator, store);
  expect(state.status).toBe('in_transit');
  expect(state.evidence).toHaveLength(0);
});

test('keeps the attempt in review while another conflict is pending and requires a reason', async () => {
  const { state, store } = memoryStore('picked_up', {}, 1);
  await resolveSyncConflict('conflict-1', 'dismiss', 'ตรวจแล้ว', coordinator, store);
  expect(state.status).toBe('sync_review');
  await expect(resolveSyncConflict('conflict-1', 'dismiss', ' ', coordinator, store)).rejects.toThrow('ต้องระบุผลการตรวจสอบ');
});
