import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { dateRangeFilter, parseReportRange } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { shortCode } from '@/lib/labels';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const riderJobsPageSize = 20;

// One rider's jobs behind a row of the delivery report: claimed, delivered or failed in the range, latest first.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const params = request.nextUrl.searchParams;
    const range = parseReportRange(params);
    if ('error' in range) return invalidInput(range.error);
    const riderId = params.get('riderId') ?? '';
    const page = Number(params.get('page') || '1');
    if (!riderId || !Number.isInteger(page) || page < 1) return invalidInput('ตัวกรองไม่ถูกต้อง');
    const within = dateRangeFilter(range);

    const [rider, attempts] = await Promise.all([
      db.user.findUnique({ where: { id: riderId }, select: { id: true, displayName: true, riderProfile: { select: { riderCode: true } } } }),
      db.deliveryAttempt.findMany({
        where: { riderId, OR: [{ claimedAt: within }, { deliveredAt: within }, { failedAt: within }] },
        select: {
          id: true, status: true, claimedAt: true, pickedUpAt: true, deliveredAt: true, failedAt: true, failureReason: true,
          evidence: { select: { id: true } },
          deliveryRequest: { select: { hn: true, patientName: true, deliveryZone: { select: { displayName: true } } } },
        },
      }),
    ]);
    if (!rider) return NextResponse.json({ message: 'ไม่พบไรเดอร์' }, { status: 404 });

    const latest = (attempt: (typeof attempts)[number]) => (attempt.deliveredAt ?? attempt.failedAt ?? attempt.claimedAt ?? new Date(0)).getTime();
    const sorted = [...attempts].sort((left, right) => latest(right) - latest(left));
    const pages = Math.max(1, Math.ceil(sorted.length / riderJobsPageSize));
    return NextResponse.json({
      rider: { id: rider.id, displayName: rider.displayName, riderCode: rider.riderProfile?.riderCode ?? null },
      page, pages, total: sorted.length,
      items: sorted.slice((page - 1) * riderJobsPageSize, page * riderJobsPageSize).map((attempt) => ({
        id: attempt.id,
        packageCode: shortCode(attempt.id),
        status: attempt.status,
        hn: attempt.deliveryRequest.hn,
        patientName: attempt.deliveryRequest.patientName,
        zone: attempt.deliveryRequest.deliveryZone.displayName,
        claimedAt: attempt.claimedAt,
        finishedAt: attempt.deliveredAt ?? attempt.failedAt,
        failureReason: attempt.failureReason,
        minutes: attempt.deliveredAt && attempt.pickedUpAt ? Math.round((attempt.deliveredAt.getTime() - attempt.pickedUpAt.getTime()) / 60_000) : null,
        hasEvidence: attempt.evidence !== null,
      })),
    }, { headers: { 'cache-control': 'no-store' } });
  });
}
