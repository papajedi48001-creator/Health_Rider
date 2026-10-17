import { DomainError } from '@/domain/errors';

export const historyPageSize = 25;

export type HistoryFilters = { hn: string; rider: string; subdistrictCode: string; zoneId: string; page: number };

// Reads the search box values; blanks mean "any".
export function parseHistoryFilters(params: URLSearchParams): HistoryFilters {
  const text = (name: string, max: number) => {
    const value = (params.get(name) ?? '').trim();
    if (value.length > max) throw new DomainError('คำค้นยาวเกินไป');
    return value;
  };
  const page = Number(params.get('page') || '1');
  if (!Number.isInteger(page) || page < 1) throw new DomainError('หน้าไม่ถูกต้อง');
  return { hn: text('hn', 100), rider: text('rider', 100), subdistrictCode: text('subdistrict', 32), zoneId: text('zone', 26), page };
}

// Prisma conditions for delivery attempts that match every filled-in filter.
export function historyWhere(filters: HistoryFilters, createdAt: { gte: Date; lt: Date }) {
  return {
    createdAt,
    ...(filters.rider ? {
      rider: { OR: [{ displayName: { contains: filters.rider } }, { riderProfile: { riderCode: { contains: filters.rider } } }] },
    } : {}),
    deliveryRequest: {
      // The patient box takes an HN or part of a name.
      ...(filters.hn ? { OR: [{ hn: { contains: filters.hn } }, { patientName: { contains: filters.hn } }] } : {}),
      ...(filters.zoneId ? { deliveryZoneId: filters.zoneId } : {}),
      ...(filters.subdistrictCode ? { deliveryZone: { subdistrictCode: filters.subdistrictCode } } : {}),
    },
  };
}
