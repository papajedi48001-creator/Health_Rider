import { expect, test } from 'vitest';
import { deliveryAttemptStatuses, newPublicId } from '@/domain/delivery/status';

test('exposes only approved delivery attempt statuses', () => {
  expect(deliveryAttemptStatuses).toEqual([
    'prepared',
    'claimed',
    'in_transit',
    'delivered',
    'delivery_failed',
    'return_required',
    'returned',
    'sync_review',
  ]);
});

test('creates a ULID-shaped public identifier', () => {
  expect(newPublicId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
});
