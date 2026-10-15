import { indexedDbOfflineEventStore } from '@/pwa/indexeddb-store';
import { OfflineQueue, type OfflineEvent, type SyncResult } from '@/pwa/offline-queue';
import { withBasePath } from '@/lib/base-path';

export const riderQueue = new OfflineQueue(indexedDbOfflineEventStore);

export async function sendOfflineEvent(event: OfflineEvent): Promise<SyncResult> {
  const response = await fetch(withBasePath('/api/rider/sync-events'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
  if (!response.ok) return { acknowledged: false };
  const body = (await response.json()) as { acknowledged?: boolean; outcome?: { kind: string } };
  return { acknowledged: body.acknowledged === true, outcome: body.outcome };
}

export function syncRiderQueue() {
  return riderQueue.sync({ send: sendOfflineEvent });
}
