export type ZoneRate = {
  id: string;
  deliveryZoneId: string;
  satang: number;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
};

type ZoneRateReader = {
  listForZone(zoneId: string): Promise<ZoneRate[]>;
};

export async function resolveZoneRate(zoneId: string, on: Date, reader: ZoneRateReader): Promise<ZoneRate> {
  const match = (await reader.listForZone(zoneId))
    .filter((rate) => rate.effectiveFrom <= on && (!rate.effectiveUntil || rate.effectiveUntil >= on))
    .sort((left, right) => right.effectiveFrom.getTime() - left.effectiveFrom.getTime())[0];

  if (!match) {
    throw new Error('ไม่พบอัตราค่าบริการที่มีผลใช้สำหรับโซนนี้');
  }

  return match;
}
