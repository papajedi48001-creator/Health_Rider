import { villageKey } from '@/domain/delivery/village-address';
import { DomainError } from '@/domain/errors';
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

export const noHealthCenterMessage = (zoneName: string) =>
  `โซน ${zoneName} ยังไม่มี รพ.สต. รับผิดชอบ จึงออก QR ให้ไรเดอร์ไม่ได้ ให้ผู้ดูแลระบบตั้ง รพ.สต. ที่เมนูโซนจัดส่ง หรือแก้ไขโซนของงานนี้`;

// A package goes out only to a village some รพ.สต. looks after, so no QR is issued for a zone without one.
// HOSxP is asked only when admin has not chosen the รพ.สต.; if HOSxP cannot be reached, admin's choice is what counts.
export async function ensureZoneHasHealthCenter(
  zone: Zone & { displayName: string },
  fromHos: () => Promise<Map<string, string>> = hosVillageHealthCenters,
): Promise<string> {
  const name = zoneHealthCenterName(zone, zone.healthCenter ? new Map() : await fromHos());
  if (!name) throw new DomainError(noHealthCenterMessage(zone.displayName), 409);
  return name;
}

export const zoneHealthCenterSelect = {
  subdistrictCode: true, villageCode: true, displayName: true, healthCenter: { select: { name: true } },
} as const;
