import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import type { ZonedCandidate } from '@/hos/types';
import { db } from '@/lib/db';
import { handleRoute, invalidInput } from '@/lib/route';
import { startOfBangkokDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

// Eligible HOSxP visits for a Thai date that do not yet have a Delivery Request.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const requestedDate = request.nextUrl.searchParams.get('date');
    const on = requestedDate ? startOfBangkokDay(requestedDate) : new Date();
    if (!on) return invalidInput('วันที่ค้นหาไม่ถูกต้อง');

    const candidates = await (await getHosCandidateRepository()).eligibleFor(on);
    const confirmed = candidates.length === 0 ? [] : await db.deliveryRequest.findMany({
      where: { hosVisitNumber: { in: candidates.map((candidate) => candidate.visitNumber) } },
      select: { hosVisitNumber: true },
    });
    const confirmedVisits = new Set(confirmed.map((request) => request.hosVisitNumber));
    const pending = candidates.filter((candidate) => !confirmedVisits.has(candidate.visitNumber));
    const zones = pending.length === 0 ? [] : await db.deliveryZone.findMany({
      where: { active: true }, select: { id: true, displayName: true, subdistrictCode: true, villageCode: true },
    });
    const zoneByCode = new Map(zones.map((zone) => [`${zone.subdistrictCode}/${zone.villageCode}`, { id: zone.id, displayName: zone.displayName }]));
    const zoned: ZonedCandidate[] = pending.map((candidate) => ({
      ...candidate, zone: zoneByCode.get(`${candidate.subdistrictCode}/${candidate.villageCode}`) ?? null,
    }));
    return NextResponse.json(zoned);
  });
}
