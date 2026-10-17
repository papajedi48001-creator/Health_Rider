import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const maxSuggestions = 8;

// Patients whose HN or name contains the typed text, taken only from requests that have had a delivery.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const typed = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (typed.length > 100) throw new DomainError('คำค้นยาวเกินไป');
    if (!typed) return NextResponse.json({ patients: [] });
    const requests = await db.deliveryRequest.findMany({
      where: { attempts: { some: {} }, OR: [{ hn: { contains: typed } }, { patientName: { contains: typed } }] },
      orderBy: { createdAt: 'desc' },
      select: { hn: true, patientName: true },
      // A patient can have many deliveries, so read a few extra and keep the latest name per HN.
      take: maxSuggestions * 5,
    });
    const byHn = new Map<string, string>();
    for (const row of requests) if (!byHn.has(row.hn)) byHn.set(row.hn, row.patientName);
    const patients = [...byHn].slice(0, maxSuggestions).map(([hn, patientName]) => ({ hn, patientName }));
    return NextResponse.json({ patients });
  });
}
