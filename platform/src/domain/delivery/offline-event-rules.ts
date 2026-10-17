import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

export const offlineEventTypes = ['picked_up', 'delivered', 'delivery_failed'] as const;
export type OfflineEventType = (typeof offlineEventTypes)[number];

export const failedDeliveryReasons = ['recipient_unavailable', 'address_not_found', 'recipient_declined', 'unsafe_to_deliver'] as const;
export type FailedDeliveryReason = (typeof failedDeliveryReasons)[number];

export const recipientRelations = ['self', 'spouse', 'child', 'parent', 'relative', 'caregiver', 'other'] as const;
export type RecipientRelation = (typeof recipientRelations)[number];

export type OfflineEventDetails =
  | { eventType: 'picked_up' }
  | { eventType: 'delivered'; recipientRelation: RecipientRelation; location?: EvidenceLocation }
  | { eventType: 'delivery_failed'; reason: FailedDeliveryReason };

// GPS position of the phone when the delivery photo was taken.
export type EvidenceLocation = { latitude: number; longitude: number; accuracyM: number | null };

export type AttemptUpdate = {
  status: DeliveryAttemptStatus;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: FailedDeliveryReason;
};

export type ConflictReason = 'version_mismatch' | 'invalid_transition';

export type OfflineEventDecision =
  | { kind: 'apply'; update: AttemptUpdate }
  | { kind: 'conflict'; reason: ConflictReason };

const activeStatuses: readonly DeliveryAttemptStatus[] = ['claimed', 'in_transit'];

export function parseOfflineEventDetails(eventType: unknown, payload: Record<string, unknown>): OfflineEventDetails | null {
  if (eventType === 'picked_up') return { eventType };
  if (eventType === 'delivered' && isOneOf(recipientRelations, payload.recipientRelation)) {
    const location = parseEvidenceLocation(payload.location);
    return { eventType, recipientRelation: payload.recipientRelation, ...(location ? { location } : {}) };
  }
  if (eventType === 'delivery_failed' && isOneOf(failedDeliveryReasons, payload.reason)) {
    return { eventType, reason: payload.reason };
  }
  return null;
}

// Decides how an offline event changes its attempt. Events recorded against an amended
// delivery version, or in a state that no longer allows them, are kept for coordinator review.
export function decideOfflineEvent(
  attempt: { status: DeliveryAttemptStatus },
  currentDeliveryVersion: number,
  event: { deliveryVersion: number; deviceCapturedAt: Date; details: OfflineEventDetails },
): OfflineEventDecision {
  if (event.deliveryVersion !== currentDeliveryVersion) return { kind: 'conflict', reason: 'version_mismatch' };
  const update = transition(attempt.status, event.deviceCapturedAt, event.details);
  return update ? { kind: 'apply', update } : { kind: 'conflict', reason: 'invalid_transition' };
}

export function transition(status: DeliveryAttemptStatus, at: Date, details: OfflineEventDetails): AttemptUpdate | null {
  switch (details.eventType) {
    case 'picked_up':
      return status === 'claimed' ? { status: 'in_transit', pickedUpAt: at } : null;
    case 'delivered':
      return activeStatuses.includes(status) ? { status: 'delivered', deliveredAt: at } : null;
    case 'delivery_failed':
      return activeStatuses.includes(status) ? { status: 'return_required', failedAt: at, failureReason: details.reason } : null;
  }
}

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

// A position the phone could not take, or one that makes no sense, is dropped; the delivery still counts.
export function parseEvidenceLocation(value: unknown): EvidenceLocation | null {
  if (!value || typeof value !== 'object') return null;
  const { latitude, longitude, accuracyM } = value as Record<string, unknown>;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const accuracy = typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM >= 0 ? Math.round(accuracyM) : null;
  return { latitude, longitude, accuracyM: accuracy };
}

// The evidence columns for a location, empty when the phone gave none.
export function evidenceLocationColumns(location: EvidenceLocation | undefined) {
  return location ? { latitude: location.latitude, longitude: location.longitude, locationAccuracyM: location.accuracyM } : {};
}
