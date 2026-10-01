import { ulid } from 'ulidx';

export const deliveryAttemptStatuses = [
  'prepared',
  'claimed',
  'in_transit',
  'delivered',
  'delivery_failed',
  'return_required',
  'returned',
  'sync_review',
] as const;

export type DeliveryAttemptStatus = (typeof deliveryAttemptStatuses)[number];

export function newPublicId(): string {
  return ulid();
}
