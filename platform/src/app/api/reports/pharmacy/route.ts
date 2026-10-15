import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { csvResponse, dateRangeFilter, parseReportRange, summarizePharmacy, toCsv } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { failureReasonLabels } from '@/lib/labels';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const zone = { select: { subdistrictCode: true, subdistrictName: true, displayName: true } } as const;
const backlogStatuses = ['prepared', 'claimed', 'in_transit', 'return_required', 'sync_review'] as const;

// Pharmacy's report: confirmations from HOSxP, outcomes and returns by subdistrict and day, and today's open work.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const range = parseReportRange(request.nextUrl.searchParams);
    if ('error' in range) return invalidInput(range.error);
    const within = dateRangeFilter(range);

    const [requests, attempts, open] = await Promise.all([
      db.deliveryRequest.findMany({ where: { createdAt: within }, select: { createdAt: true, deliveryZone: zone } }),
      db.deliveryAttempt.findMany({
        where: { OR: [{ deliveredAt: within }, { failedAt: within }, { returnedAt: within }] },
        select: { deliveredAt: true, failedAt: true, returnedAt: true, failureReason: true, deliveryRequest: { select: { deliveryZone: zone } } },
      }),
      db.deliveryAttempt.groupBy({ by: ['status'], where: { status: { in: [...backlogStatuses] } }, _count: { _all: true } }),
    ]);
    const backlog = Object.fromEntries(backlogStatuses.map((status) => [status, open.find((row) => row.status === status)?._count._all ?? 0])) as Record<(typeof backlogStatuses)[number], number>;
    const summary = summarizePharmacy(range, { requests, attempts, backlog });

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      return csvResponse('pharmacy-report', range, toCsv(
        ['วันที่', 'ยืนยันจาก HOSxP', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ', 'รับยาคืน'],
        [
          ...summary.byDay.map((day) => [day.date, day.confirmed, day.delivered, day.failed, day.returned]),
          ['รวม', summary.totals.confirmed, summary.totals.delivered, summary.totals.failed, summary.totals.returned],
          [],
          ['ตำบล', 'ยืนยันจาก HOSxP', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ', 'รับยาคืน'],
          ...summary.bySubdistrict.map((row) => [row.subdistrictName ?? row.subdistrictCode, row.confirmed, row.delivered, row.failed, row.returned]),
          [],
          ['สาเหตุที่ส่งไม่สำเร็จ', 'จำนวน'],
          ...summary.failureReasons.map((row) => [failureReasonLabels[row.reason as keyof typeof failureReasonLabels] ?? row.reason, row.count]),
        ],
      ));
    }
    return NextResponse.json({ from: range.from, to: range.to, ...summary }, { headers: { 'cache-control': 'no-store' } });
  });
}
