import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { refreshJobsFromHos } from '@/domain/delivery/refresh-from-hos';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const recentDays = 14;

// Requests pharmacy still acts on: no package yet, a package waiting for a rider, or medication to take back.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const requests = await db.deliveryRequest.findMany({
      where: { createdAt: { gte: new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000) } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, hosVisitNumber: true, hn: true, patientName: true, deliveryAddress: true, createdAt: true,
        deliveryZone: { select: { id: true, displayName: true, subdistrictCode: true, subdistrictName: true, villageCode: true } },
        attempts: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true, failureReason: true, failedAt: true } },
      },
    });

    // Labels print from these, so jobs saved without name titles or village names get them before the board shows; HOSxP being down never blocks it.
    const refreshed = await refreshJobsFromHos(getHosCandidateRepository, db);
    const rows = requests.map((item) => ({
      id: item.id, visitNumber: item.hosVisitNumber, hn: item.hn, patientName: refreshed.get(item.id)?.patientName ?? item.patientName, deliveryAddress: refreshed.get(item.id)?.deliveryAddress ?? item.deliveryAddress,
      zone: item.deliveryZone, createdAt: item.createdAt, latestAttempt: item.attempts[0] ?? null,
    }));
    return NextResponse.json({
      toPrepare: rows.filter((row) => !row.latestAttempt || row.latestAttempt.status === 'returned'),
      awaitingRider: rows.filter((row) => row.latestAttempt?.status === 'prepared'),
      returnRequired: rows.filter((row) => row.latestAttempt?.status === 'return_required'),
    });
  });
}
