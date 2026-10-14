import { DomainError } from '@/domain/errors';
import { bangkokDateString } from '@/lib/time';

export type ServiceRateRecord = {
  subdistrictCode: string;
  deliveryZoneId: string | null;
  rateSatang: number;
  effectiveFrom: Date;
};

export type AppliedRate = { rateSatang: number; rateEffectiveFrom: Date };

// A Thai calendar day as the UTC-midnight Date that Prisma uses for a DATE column.
export function calendarDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00.000Z`);
}

// The zone's own rate wins over a whole-subdistrict rate; within each, the latest one already in effect applies.
export function resolveRate(
  rates: readonly ServiceRateRecord[],
  zone: { id: string; subdistrictCode: string },
  on: Date,
): AppliedRate | null {
  const inEffect = rates.filter((rate) => rate.effectiveFrom.getTime() <= on.getTime());
  const latest = (candidates: ServiceRateRecord[]) =>
    candidates.reduce<ServiceRateRecord | null>((best, rate) => (!best || rate.effectiveFrom > best.effectiveFrom ? rate : best), null);
  const chosen = latest(inEffect.filter((rate) => rate.deliveryZoneId === zone.id))
    ?? latest(inEffect.filter((rate) => rate.deliveryZoneId === null && rate.subdistrictCode === zone.subdistrictCode));
  return chosen && { rateSatang: chosen.rateSatang, rateEffectiveFrom: chosen.effectiveFrom };
}

export function parseServiceRate(value: unknown): { subdistrictCode: string; deliveryZoneId: string | null; rateSatang: number; effectiveFrom: Date } {
  const body = (value ?? {}) as Record<string, unknown>;
  const subdistrictCode = typeof body.subdistrictCode === 'string' ? body.subdistrictCode.trim() : '';
  const deliveryZoneId = typeof body.deliveryZoneId === 'string' && body.deliveryZoneId.trim() ? body.deliveryZoneId.trim() : null;
  const baht = typeof body.baht === 'string' ? body.baht.trim() : typeof body.baht === 'number' ? String(body.baht) : '';
  const effectiveFrom = typeof body.effectiveFrom === 'string' ? body.effectiveFrom.trim() : '';
  if (!/^\d{6}$/.test(subdistrictCode)) throw new DomainError('ต้องเลือกตำบล');
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(baht) || Number(baht) <= 0) throw new DomainError('ค่าบริการต้องเป็นจำนวนเงินบาทที่มากกว่า 0 (ทศนิยมไม่เกิน 2 ตำแหน่ง)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || Number.isNaN(calendarDate(effectiveFrom).getTime())
    || calendarDate(effectiveFrom).toISOString().slice(0, 10) !== effectiveFrom) throw new DomainError('วันเริ่มใช้ไม่ถูกต้อง');
  return { subdistrictCode, deliveryZoneId, rateSatang: Math.round(Number(baht) * 100), effectiveFrom: calendarDate(effectiveFrom) };
}

type RateReader = {
  serviceRate: {
    findMany(args: {
      where: { effectiveFrom: { lte: Date }; OR: ({ deliveryZoneId: string } | { deliveryZoneId: null; subdistrictCode: string })[] };
      select: { subdistrictCode: true; deliveryZoneId: true; rateSatang: true; effectiveFrom: true };
    }): Promise<ServiceRateRecord[]>;
  };
};

// Reads only the rates that could apply to this zone today (Thai date) and resolves the one in effect.
export async function findRateInEffect(client: RateReader, zone: { id: string; subdistrictCode: string }, now = new Date()): Promise<AppliedRate | null> {
  const today = calendarDate(bangkokDateString(now));
  const rates = await client.serviceRate.findMany({
    where: { effectiveFrom: { lte: today }, OR: [{ deliveryZoneId: zone.id }, { deliveryZoneId: null, subdistrictCode: zone.subdistrictCode }] },
    select: { subdistrictCode: true, deliveryZoneId: true, rateSatang: true, effectiveFrom: true },
  });
  return resolveRate(rates, zone, today);
}
