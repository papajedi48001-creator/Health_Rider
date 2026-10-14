import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';
import { parseOfflineEventDetails, transition, type AttemptUpdate } from '@/domain/delivery/offline-event-rules';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

export const conflictOutcomes = ['accept', 'dismiss'] as const;
export type ConflictOutcome = (typeof conflictOutcomes)[number];

type PendingConflict = {
  id: string;
  status: string;
  deliveryAttemptId: string;
  previousStatus: DeliveryAttemptStatus;
  event: { eventType: string; payload: Record<string, unknown>; deviceCapturedAt: Date };
};

// All calls run inside one database transaction.
type ConflictStore = {
  findPending(conflictId: string): Promise<PendingConflict | null>;
  otherPendingCount(attemptId: string, conflictId: string): Promise<number>;
  updateConflict(record: { id: string; status: 'resolved'; outcome: ConflictOutcome; resolution: string; resolvedById: string; resolvedAt: Date }): Promise<unknown>;
  updateAttempt(attemptId: string, update: AttemptUpdate): Promise<unknown>;
  createEvidence(record: { deliveryAttemptId: string; recipientRelation: string; photoPath: string; deviceCapturedAt: Date }): Promise<unknown>;
  createAudit(audit: { actorId: string; action: string; auditableId: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; reason: string }): Promise<unknown>;
};

// Accept applies the retained offline event as if it had matched; dismiss keeps it as evidence only
// and returns the attempt to the state it had before the conflict.
export async function resolveSyncConflict(conflictId: string, outcome: ConflictOutcome, resolution: string, coordinator: SessionUser | null, store: ConflictStore) {
  const actor = requireRole(coordinator, 'coordinator', 'admin');
  if (!conflictOutcomes.includes(outcome)) throw new DomainError('ผลการตรวจสอบไม่ถูกต้อง');
  if (!resolution.trim()) throw new DomainError('ต้องระบุผลการตรวจสอบ');
  const conflict = await store.findPending(conflictId);
  if (!conflict || conflict.status !== 'pending') throw new DomainError('ไม่พบรายการขัดแย้งที่รอตรวจสอบ');

  let update: AttemptUpdate = { status: conflict.previousStatus };
  if (outcome === 'accept') {
    const details = parseOfflineEventDetails(conflict.event.eventType, conflict.event.payload);
    const accepted = details && transition(conflict.previousStatus, conflict.event.deviceCapturedAt, details);
    if (!details || !accepted) throw new DomainError('ยอมรับรายการนี้ไม่ได้เพราะสถานะงานไม่รองรับ โปรดเลือกไม่ยอมรับ');
    update = accepted;
    if (details.eventType === 'delivered') {
      const photoPath = conflict.event.payload.photoPath;
      if (typeof photoPath !== 'string') throw new DomainError('รายการนี้ไม่มีรูปหลักฐานการส่ง');
      await store.createEvidence({ deliveryAttemptId: conflict.deliveryAttemptId, recipientRelation: details.recipientRelation, photoPath, deviceCapturedAt: conflict.event.deviceCapturedAt });
    }
  }

  const stillInReview = (await store.otherPendingCount(conflict.deliveryAttemptId, conflict.id)) > 0;
  const finalUpdate: AttemptUpdate = stillInReview ? { ...update, status: 'sync_review' } : update;
  const resolvedAt = new Date();
  await store.updateConflict({ id: conflict.id, status: 'resolved', outcome, resolution, resolvedById: actor.id, resolvedAt });
  await store.updateAttempt(conflict.deliveryAttemptId, finalUpdate);
  await store.createAudit({
    actorId: actor.id, action: 'sync_conflict.resolved', auditableId: conflict.deliveryAttemptId,
    oldValues: { status: 'sync_review' }, newValues: { status: finalUpdate.status, conflictId: conflict.id, outcome }, reason: resolution,
  });
  return { id: conflict.id, outcome, status: finalUpdate.status };
}
