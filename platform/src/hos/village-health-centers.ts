import { villageKey } from '@/domain/delivery/village-address';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';

type Zone = { subdistrictCode: string; villageCode: string; healthCenter: { name: string } | null };

// The รพ.สต. HOSxP maps each village to; empty when HOSxP is not set up or cannot be reached, so pages never wait on it.
export async function hosVillageHealthCenters(): Promise<Map<string, string>> {
  try {
    return await (await getHosCandidateRepository()).villageHealthCenters();
  } catch {
    return new Map();
  }
}

// The รพ.สต. printed for a zone: one an admin chose for the zone wins, otherwise the one HOSxP maps its village to.
export function zoneHealthCenterName(zone: Zone, fromHos: Map<string, string>): string | null {
  return zone.healthCenter?.name ?? fromHos.get(villageKey(zone.subdistrictCode, zone.villageCode)) ?? null;
}
