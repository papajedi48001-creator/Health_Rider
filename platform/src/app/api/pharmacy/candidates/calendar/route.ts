import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

// For each day of a month that has eligible HOSxP visits: how many, and how many still wait for pharmacy.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const month = request.nextUrl.searchParams.get('month') ?? '';
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) return invalidInput('เดือนไม่ถูกต้อง');
    const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();

    const visits = await (await getHosCandidateRepository()).visitsBetween(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`);
    const confirmed = visits.length === 0 ? [] : await db.deliveryRequest.findMany({
      where: { hosVisitNumber: { in: visits.map((visit) => visit.visitNumber) } },
      select: { hosVisitNumber: true },
    });
    const confirmedVisits = new Set(confirmed.map((row) => row.hosVisitNumber));

    const byDate = new Map<string, { date: string; visits: number; pending: number }>();
    for (const visit of visits) {
      const day = byDate.get(visit.date) ?? { date: visit.date, visits: 0, pending: 0 };
      day.visits += 1;
      if (!confirmedVisits.has(visit.visitNumber)) day.pending += 1;
      byDate.set(visit.date, day);
    }
    return NextResponse.json({ days: [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)) });
  });
}
