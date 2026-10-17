import { expect, test } from 'vitest';
import { decideOfflineEvent, parseOfflineEventDetails } from '@/domain/delivery/offline-event-rules';

const at = new Date('2026-10-14T03:00:00.000Z');

test('accepts only known event types with their required details', () => {
  expect(parseOfflineEventDetails('picked_up', {})).toEqual({ eventType: 'picked_up' });
  expect(parseOfflineEventDetails('delivered', { recipientRelation: 'spouse' })).toEqual({ eventType: 'delivered', recipientRelation: 'spouse' });
  expect(parseOfflineEventDetails('delivered', {})).toBeNull();
  expect(parseOfflineEventDetails('delivery_failed', { reason: 'made_up' })).toBeNull();
  expect(parseOfflineEventDetails('teleported', {})).toBeNull();
});

test('moves an attempt through pickup, delivery and failure', () => {
  expect(decideOfflineEvent({ status: 'claimed' }, 1, { deliveryVersion: 1, deviceCapturedAt: at, details: { eventType: 'picked_up' } }))
    .toEqual({ kind: 'apply', update: { status: 'in_transit', pickedUpAt: at } });
  expect(decideOfflineEvent({ status: 'in_transit' }, 1, { deliveryVersion: 1, deviceCapturedAt: at, details: { eventType: 'delivered', recipientRelation: 'self' } }))
    .toEqual({ kind: 'apply', update: { status: 'delivered', deliveredAt: at } });
  expect(decideOfflineEvent({ status: 'claimed' }, 1, { deliveryVersion: 1, deviceCapturedAt: at, details: { eventType: 'delivery_failed', reason: 'address_not_found' } }))
    .toEqual({ kind: 'apply', update: { status: 'return_required', failedAt: at, failureReason: 'address_not_found' } });
});

test('routes an event from an amended delivery version or a closed attempt to review', () => {
  expect(decideOfflineEvent({ status: 'in_transit' }, 2, { deliveryVersion: 1, deviceCapturedAt: at, details: { eventType: 'delivered', recipientRelation: 'self' } }))
    .toEqual({ kind: 'conflict', reason: 'version_mismatch' });
  expect(decideOfflineEvent({ status: 'delivered' }, 1, { deliveryVersion: 1, deviceCapturedAt: at, details: { eventType: 'delivery_failed', reason: 'recipient_unavailable' } }))
    .toEqual({ kind: 'conflict', reason: 'invalid_transition' });
});

test('keeps a sensible GPS position with a delivery and drops anything else', () => {
  expect(parseOfflineEventDetails('delivered', { recipientRelation: 'self', location: { latitude: 17.25, longitude: 103.95, accuracyM: 11.6 } }))
    .toEqual({ eventType: 'delivered', recipientRelation: 'self', location: { latitude: 17.25, longitude: 103.95, accuracyM: 12 } });
  for (const location of [undefined, 'here', { latitude: 95, longitude: 10 }, { latitude: '17', longitude: 103 }, { latitude: Number.NaN, longitude: 1 }]) {
    expect(parseOfflineEventDetails('delivered', { recipientRelation: 'self', location })).toEqual({ eventType: 'delivered', recipientRelation: 'self' });
  }
});
