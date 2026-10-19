// Jobs confirmed before names carried the HOSxP title (นาย, นาง, ด.ช.) were saved without it. Once per server
// process every job is looked up and saved with its current HOSxP name, so every page and label shows the title.
// Jobs confirmed later already carry it.
type Row = { id: string; hn: string; patientName: string };
type Lookup = (hns: string[]) => Promise<Map<string, string>>;
type Store = {
  deliveryRequest: {
    findMany(args: { select: { id: true; hn: true; patientName: true } }): Promise<Row[]>;
    update(args: { where: { id: string }; data: { patientName: string } }): Promise<unknown>;
  };
};

// A failed sweep is not retried on every page load, so a HOSxP outage does not slow pages down each time.
const retryAfterMs = 5 * 60_000;
const hnsPerQuery = 500;

export function createPatientNameRefresher() {
  let swept = false;
  let retryAt = 0;
  let running: Promise<Map<string, string>> | null = null;

  async function sweep(lookup: Lookup, store: Store): Promise<Map<string, string>> {
    const rows = await store.deliveryRequest.findMany({ select: { id: true, hn: true, patientName: true } });
    const hns = [...new Set(rows.map((row) => row.hn))];
    const names = new Map<string, string>();
    for (let index = 0; index < hns.length; index += hnsPerQuery) {
      for (const [hn, name] of await lookup(hns.slice(index, index + hnsPerQuery))) names.set(hn, name);
    }
    const changed = new Map<string, string>();
    for (const row of rows) {
      const name = names.get(row.hn)?.trim();
      if (name && name !== row.patientName) {
        await store.deliveryRequest.update({ where: { id: row.id }, data: { patientName: name } });
        changed.set(row.id, name);
      }
    }
    return changed;
  }

  // Returns the new name of each job it changed, by job id; empty once done, while waiting to retry, or on failure.
  return async function refresh(lookup: Lookup, store: Store, now = Date.now()): Promise<Map<string, string>> {
    if (swept || now < retryAt) return new Map();
    running ??= sweep(lookup, store)
      .then((changed) => { swept = true; return changed; })
      .catch(() => { retryAt = now + retryAfterMs; return new Map<string, string>(); })
      .finally(() => { running = null; });
    return running;
  };
}

export const refreshPatientNames = createPatientNameRefresher();
