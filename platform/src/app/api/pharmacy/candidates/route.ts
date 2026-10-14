import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { handleRoute, invalidInput } from '@/lib/route';
import { startOfBangkokDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

// Eligible HOS visits for a Thai date that do not yet have a Delivery Request.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const requestedDate = request.nextUrl.searchParams.get('date');
    const on = requestedDate ? startOfBangkokDay(requestedDate) : new Date();
    if (!on) return invalidInput('วันที่ค้นหาไม่ถูกต้อง');

    const candidates = await getHosCandidateRepository(process.env).eligibleFor(on);
    const confirmed = candidates.length === 0 ? [] : await db.deliveryRequest.findMany({
      where: { hosVisitNumber: { in: candidates.map((candidate) => candidate.visitNumber) } },
      select: { hosVisitNumber: true },
    });
    const confirmedVisits = new Set(confirmed.map((request) => request.hosVisitNumber));
    return NextResponse.json(candidates.filter((candidate) => !confirmedVisits.has(candidate.visitNumber)));
  });
}
