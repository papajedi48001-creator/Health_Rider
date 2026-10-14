import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

export const offlineEventTypes = ['picked_up', 'delivered', 'delivery_failed'] as const;
export type OfflineEventType = (typeof offlineEventTypes)[number];

export const failedDeliveryReasons = ['recipient_unavailable', 'address_not_found', 'recipient_declined', 'unsafe_to_deliver'] as const;
export type FailedDeliveryReason = (typeof failedDeliveryReasons)[number];

export const recipientRelations = ['self', 'spouse', 'child', 'parent', 'relative', 'caregiver', 'other'] as const;
export type RecipientRelation = (typeof recipientRelations)[number];

export type OfflineEventDetails =
  | { eventType: 'picked_up' }
  | { eventType: 'delivered'; recipientRelation: RecipientRelation }
  | { eventType: 'delivery_failed'; reason: FailedDeliveryReason };

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
    return { eventType, recipientRelation: payload.recipientRelation };
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
