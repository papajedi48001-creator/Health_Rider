export type AuditEventInput = {
  id: string;
  actorId: string;
  action: string;
  auditableType: string;
  auditableId: string;
  reason: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
};

type AuditEventStore = {
  create(input: { data: AuditEventInput }): Promise<unknown>;
};

export async function writeAuditEvent(store: AuditEventStore, input: AuditEventInput): Promise<unknown> {
  return store.create({ data: input });
}
