import { villageKey, withVillageName } from '@/domain/delivery/village-address';
import type { HosPatient } from '@/hos/types';

// Jobs confirmed before names carried the HOSxP title (นาย, นาง, ด.ช.) were saved without it, and jobs confirmed
// before the fix of 2026-10-21 were saved with the contact person's address (informaddr) instead of the patient's.
// Once per server process every job is looked up and saved with its current HOSxP name and registered address
// with the village name, and every zone name gains its village name too, since most pages show the zone in place
// of the address. An address staff corrected by hand (an in-transit amendment) is kept.
type Row = {
  id: string; hn: string; patientName: string; deliveryAddress: string;
  deliveryZone: { subdistrictCode: string; villageCode: string };
};
type Hos = { patients(hns: string[]): Promise<Map<string, HosPatient>>; villageNames(): Promise<Map<string, string>> };
type Store = {
  deliveryRequest: {
    findMany(args: {
      select: { id: true; hn: true; patientName: true; deliveryAddress: true; deliveryZone: { select: { subdistrictCode: true; villageCode: true } } };
    }): Promise<Row[]>;
    update(args: { where: { id: string }; data: { patientName?: string; deliveryAddress?: string } }): Promise<unknown>;
  };
  deliveryZone: {
    findMany(args: { select: { id: true; subdistrictCode: true; villageCode: true; displayName: true } }): Promise<Array<{ id: string; subdistrictCode: string; villageCode: string; displayName: string }>>;
    update(args: { where: { id: string }; data: { displayName: string } }): Promise<unknown>;
  };
  auditEvent: {
    findMany(args: { where: { action: string }; select: { auditableId: true } }): Promise<Array<{ auditableId: string }>>;
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
    const patients = new Map<string, HosPatient>();
    for (let index = 0; index < hns.length; index += hnsPerQuery) {
      for (const [hn, patient] of await source.patients(hns.slice(index, index + hnsPerQuery))) patients.set(hn, patient);
    }
    const amended = new Set((await store.auditEvent.findMany({ where: { action: 'delivery_request.amended_in_transit' }, select: { auditableId: true } }))
      .map((event) => event.auditableId));
    const villages = await source.villageNames();
    const zones = await store.deliveryZone.findMany({ select: { id: true, subdistrictCode: true, villageCode: true, displayName: true } });
    for (const zone of zones) {
      const displayName = withVillageName(zone.displayName, villages.get(villageKey(zone.subdistrictCode, zone.villageCode)));
      if (displayName !== zone.displayName) await store.deliveryZone.update({ where: { id: zone.id }, data: { displayName } });
    }
    const changed = new Map<string, JobDetails>();
    for (const row of rows) {
      const patient = patients.get(row.hn);
      const patientName = patient?.name.trim() || row.patientName;
      // A blank HOSxP address keeps the saved one.
      const hosAddress = amended.has(row.id) ? '' : patient?.address.trim() ?? '';
      const deliveryAddress = hosAddress
        || withVillageName(row.deliveryAddress, villages.get(villageKey(row.deliveryZone.subdistrictCode, row.deliveryZone.villageCode)));
      if (patientName === row.patientName && deliveryAddress === row.deliveryAddress) continue;
      await store.deliveryRequest.update({
        where: { id: row.id },
        data: { ...(patientName !== row.patientName ? { patientName } : {}), ...(deliveryAddress !== row.deliveryAddress ? { deliveryAddress } : {}) },
      });
      changed.set(row.id, { patientName, deliveryAddress });
    }
    // No village names means hosp_moo_control could not be read this time; the names already saved stay, and the
    // sweep runs again a few minutes later instead of never.
    if (villages.size === 0) throw new Error('HOSxP village names unavailable');
    return changed;
  }

  // Returns the new details of each job it changed, by job id; empty once done, while waiting to retry, or on failure.
  return async function refresh(hos: () => Promise<Hos>, store: Store, now = Date.now()): Promise<Map<string, JobDetails>> {
    if (swept || now < retryAt) return new Map();
    running ??= sweep(hos, store)
      .then((changed) => { swept = true; return changed; })
      .catch((error: unknown) => {
        retryAt = now + retryAfterMs;
        console.warn('Refreshing jobs from HOSxP failed:', error instanceof Error ? error.message : error);
        return new Map<string, JobDetails>();
      })
      .finally(() => { running = null; });
    return running;
  };
}

export const refreshJobsFromHos = createJobRefresher();
