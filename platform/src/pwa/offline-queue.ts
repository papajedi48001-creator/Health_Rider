export type OfflineEvent = { eventUuid: string; attemptId: string; deliveryVersion: number; eventType: string; deviceCapturedAt: string; payload: Record<string, unknown> };
type SyncClient = { send(event: OfflineEvent): Promise<{ acknowledged: boolean }> };

export class OfflineQueue {
  private readonly events: OfflineEvent[] = [];

  async enqueue(event: OfflineEvent): Promise<void> {
    this.events.push(event);
  }

  async pending(): Promise<OfflineEvent[]> {
    return [...this.events];
  }

  async sync(client: SyncClient): Promise<{ acknowledged: number; acknowledgedEventUuids: string[]; remaining: number }> {
    const acknowledgedEventUuids: string[] = [];
    for (const event of [...this.events]) {
      const result = await client.send(event);
      if (result.acknowledged) {
        this.events.splice(this.events.indexOf(event), 1);
        acknowledgedEventUuids.push(event.eventUuid);
      }
    }
    return { acknowledged: acknowledgedEventUuids.length, acknowledgedEventUuids, remaining: this.events.length };
  }
}
