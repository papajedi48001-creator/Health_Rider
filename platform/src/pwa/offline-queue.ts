export type OfflineEvent = { eventUuid: string; attemptId: string; deliveryVersion: number; eventType: string; deviceCapturedAt: string; payload: Record<string, unknown> };
export type SyncResult = { acknowledged: boolean; outcome?: { kind: string } };
type SyncClient = { send(event: OfflineEvent): Promise<SyncResult> };

// Persistent storage is the queue: an event leaves the device only after the server acknowledges it.
export type OfflineEventStore = {
  load(): Promise<OfflineEvent[]>;
  save(event: OfflineEvent): Promise<void>;
  remove(eventUuid: string): Promise<void>;
};

export type SyncSummary = { acknowledged: number; acknowledgedEventUuids: string[]; remaining: number; results: Record<string, SyncResult> };

export class OfflineQueue {
  private syncing: Promise<SyncSummary> | null = null;

  constructor(private readonly store: OfflineEventStore) {}

  async enqueue(event: OfflineEvent): Promise<void> {
    await this.store.save(event);
  }

  async pending(): Promise<OfflineEvent[]> {
    return this.store.load();
  }

  // Concurrent callers share one pass so an event is never sent twice at the same time.
  sync(client: SyncClient): Promise<SyncSummary> {
    this.syncing ??= this.syncOnce(client).finally(() => { this.syncing = null; });
    return this.syncing;
  }

  private async syncOnce(client: SyncClient): Promise<SyncSummary> {
    const events = (await this.store.load()).sort((left, right) => left.deviceCapturedAt.localeCompare(right.deviceCapturedAt));
    const acknowledgedEventUuids: string[] = [];
    const results: Record<string, SyncResult> = {};
    for (const event of events) {
      const result = await client.send(event).catch((): SyncResult => ({ acknowledged: false }));
      results[event.eventUuid] = result;
      if (!result.acknowledged) continue;
      await this.store.remove(event.eventUuid);
      acknowledgedEventUuids.push(event.eventUuid);
    }
    return { acknowledged: acknowledgedEventUuids.length, acknowledgedEventUuids, remaining: events.length - acknowledgedEventUuids.length, results };
  }
}

export function memoryOfflineEventStore(): OfflineEventStore {
  const events = new Map<string, OfflineEvent>();
  return {
    load: async () => [...events.values()],
    save: async (event) => { events.set(event.eventUuid, event); },
    remove: async (eventUuid) => { events.delete(eventUuid); },
  };
}
