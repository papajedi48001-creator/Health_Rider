import { villageKey, withVillageName } from '@/domain/delivery/village-address';

// Jobs confirmed before names carried the HOSxP title (นาย, นาง, ด.ช.) and addresses the village name were saved
// without them. Once per server process every job is looked up and saved with its current HOSxP name and its
// village name, so every page and label shows them. Jobs confirmed later already carry both.
type Row = {
  id: string; hn: string; patientName: string; deliveryAddress: string;
  deliveryZone: { subdistrictCode: string; villageCode: string };
};
type Hos = { patientNames(hns: string[]): Promise<Map<string, string>>; villageNames(): Promise<Map<string, string>> };
type Store = {
  deliveryRequest: {
    findMany(args: {
      select: { id: true; hn: true; patientName: true; deliveryAddress: true; deliveryZone: { select: { subdistrictCode: true; villageCode: true } } };
    }): Promise<Row[]>;
    update(args: { where: { id: string }; data: { patientName?: string; deliveryAddress?: string } }): Promise<unknown>;
  };
};
export type JobDetails = { patientName: string; deliveryAddress: string };

// A failed sweep is not retried on every page load, so a HOSxP outage does not slow pages down each time.
const retryAfterMs = 5 * 60_000;
const hnsPerQuery = 500;

export function createJobRefresher() {
  let swept = false;
  let retryAt = 0;
  let running: Promise<Map<string, JobDetails>> | null = null;

  async function sweep(hos: () => Promise<Hos>, store: Store): Promise<Map<string, JobDetails>> {
    const rows = await store.deliveryRequest.findMany({
      select: { id: true, hn: true, patientName: true, deliveryAddress: true, deliveryZone: { select: { subdistrictCode: true, villageCode: true } } },
    });
    const source = await hos();
    const hns = [...new Set(rows.map((row) => row.hn))];
    const names = new Map<string, string>();
    for (let index = 0; index < hns.length; index += hnsPerQuery) {
      for (const [hn, name] of await source.patientNames(hns.slice(index, index + hnsPerQuery))) names.set(hn, name);
    }
    const villages = await source.villageNames();
    const changed = new Map<string, JobDetails>();
    for (const row of rows) {
      const patientName = names.get(row.hn)?.trim() || row.patientName;
      const deliveryAddress = withVillageName(row.deliveryAddress, villages.get(villageKey(row.deliveryZone.subdistrictCode, row.deliveryZone.villageCode)));
      if (patientName === row.patientName && deliveryAddress === row.deliveryAddress) continue;
      await store.deliveryRequest.update({
        where: { id: row.id },
        data: { ...(patientName !== row.patientName ? { patientName } : {}), ...(deliveryAddress !== row.deliveryAddress ? { deliveryAddress } : {}) },
      });
      changed.set(row.id, { patientName, deliveryAddress });
    }
    return changed;
  }

  // Returns the new details of each job it changed, by job id; empty once done, while waiting to retry, or on failure.
  return async function refresh(hos: () => Promise<Hos>, store: Store, now = Date.now()): Promise<Map<string, JobDetails>> {
    if (swept || now < retryAt) return new Map();
    running ??= sweep(hos, store)
      .then((changed) => { swept = true; return changed; })
      .catch(() => { retryAt = now + retryAfterMs; return new Map<string, JobDetails>(); })
      .finally(() => { running = null; });
    return running;
  };
}

export const refreshJobsFromHos = createJobRefresher();
