import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';
import { decideOfflineEvent, evidenceLocationColumns, type AttemptUpdate, type ConflictReason, type OfflineEventDetails } from '@/domain/delivery/offline-event-rules';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

export type OfflineDeliveryEventInput = {
  eventUuid: string;
  attemptId: string;
  deliveryVersion: number;
  deviceCapturedAt: Date;
  details: OfflineEventDetails;
  photoPath: string | null;
};

export type SyncOutcome = { kind: 'duplicate' } | { kind: 'rejected' } | { kind: 'applied'; status: DeliveryAttemptStatus } | { kind: 'conflict'; reason: ConflictReason };

// All calls run inside one database transaction that has locked the attempt row.
export type OfflineEventStore = {
  findByUuid(eventUuid: string, riderId: string): Promise<unknown | null>;
  lockRiderAttempt(attemptId: string, riderId: string): Promise<{ id: string; status: DeliveryAttemptStatus; deliveryVersion: number } | null>;
  createEvent(event: OfflineDeliveryEventInput & { riderId: string; serverReceivedAt: Date }): Promise<{ id: string }>;
  updateAttempt(attemptId: string, update: AttemptUpdate): Promise<unknown>;
  createEvidence(record: { deliveryAttemptId: string; recipientRelation: string; photoPath: string; deviceCapturedAt: Date; latitude?: number; longitude?: number; locationAccuracyM?: number | null }): Promise<unknown>;
  createConflict(record: { offlineDeliveryEventId: string; deliveryAttemptId: string; reason: ConflictReason; previousStatus: DeliveryAttemptStatus }): Promise<unknown>;
  createAudit(audit: { actorId: string; action: string; auditableId: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown> }): Promise<unknown>;
};

export class AttemptNotFoundError extends DomainError {
  constructor() {
    super('ไม่พบงานจัดส่ง', 404);
  }
}

// A delivered or returned attempt is finished: later events cannot reopen it or replace its evidence.
export const closedAttemptStatuses: readonly DeliveryAttemptStatus[] = ['delivered', 'returned'];

export async function syncOfflineEvent(event: OfflineDeliveryEventInput, rider: SessionUser | null, store: OfflineEventStore): Promise<SyncOutcome> {
  const actor = requireRole(rider, 'rider');
  const attempt = await store.lockRiderAttempt(event.attemptId, actor.id);
  if (!attempt) throw new AttemptNotFoundError();
  if (await store.findByUuid(event.eventUuid, actor.id)) return { kind: 'duplicate' };
  if (closedAttemptStatuses.includes(attempt.status)) {
    // Acknowledged so the phone stops resending it, and kept in the audit trail for review.
    await store.createAudit({
      actorId: actor.id, action: 'delivery_attempt.event_rejected', auditableId: attempt.id,
      oldValues: { status: attempt.status }, newValues: { status: attempt.status, eventUuid: event.eventUuid, eventType: event.details.eventType },
    });
    return { kind: 'rejected' };
  }
  if (event.details.eventType === 'delivered' && !event.photoPath) throw new DomainError('ต้องมีรูปหลักฐานการส่ง');

  const created = await store.createEvent({ ...event, riderId: actor.id, serverReceivedAt: new Date() });
  const decision = decideOfflineEvent(attempt, attempt.deliveryVersion, event);

  if (decision.kind === 'conflict') {
    await store.createConflict({ offlineDeliveryEventId: created.id, deliveryAttemptId: attempt.id, reason: decision.reason, previousStatus: attempt.status });
    await store.updateAttempt(attempt.id, { status: 'sync_review' });
    await store.createAudit({
      actorId: actor.id, action: 'delivery_attempt.sync_conflict', auditableId: attempt.id,
      oldValues: { status: attempt.status }, newValues: { status: 'sync_review', eventUuid: event.eventUuid, reason: decision.reason },
    });
    return { kind: 'conflict', reason: decision.reason };
  }

  await store.updateAttempt(attempt.id, decision.update);
  if (event.details.eventType === 'delivered' && event.photoPath) {
    await store.createEvidence({ deliveryAttemptId: attempt.id, recipientRelation: event.details.recipientRelation, photoPath: event.photoPath, deviceCapturedAt: event.deviceCapturedAt, ...evidenceLocationColumns(event.details.location) });
  }
  await store.createAudit({
    actorId: actor.id, action: `delivery_attempt.${event.details.eventType}`, auditableId: attempt.id,
    oldValues: { status: attempt.status }, newValues: { status: decision.update.status, eventUuid: event.eventUuid },
  });
  return { kind: 'applied', status: decision.update.status };
}
