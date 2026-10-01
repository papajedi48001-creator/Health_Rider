import { requireRole, type SessionUser } from '@/auth/require-role';

export type OfflineDeliveryEventInput = { eventUuid: string; attemptId: string; deliveryVersion: number; eventType: string; deviceCapturedAt: string; payload: Record<string, unknown> };
type OfflineEventStore = { findByUuid(eventUuid: string, riderId: string): Promise<unknown | null>; create(event: OfflineDeliveryEventInput & { riderId: string; serverReceivedAt: Date }): Promise<unknown> };

export async function syncOfflineEvent(event: OfflineDeliveryEventInput, rider: SessionUser | null, store: OfflineEventStore): Promise<{ kind: 'stored' | 'duplicate' }> {
  const actor = requireRole(rider, 'rider');
  if (await store.findByUuid(event.eventUuid, actor.id)) return { kind: 'duplicate' };
  await store.create({ ...event, riderId: actor.id, serverReceivedAt: new Date() });
  return { kind: 'stored' };
}
