import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { scoped } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { csvResponse, dateRangeFilter, parseReportRange, summarizeDeliveries, toCsv } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { employmentLabels, failureReasonLabels } from '@/lib/labels';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The coordinator's report: results per rider and zone, delivery time after pickup, and why deliveries failed.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const viewer = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const range = parseReportRange(request.nextUrl.searchParams);
    if ('error' in range) return invalidInput(range.error);
    const within = dateRangeFilter(range);

    const attempts = await db.deliveryAttempt.findMany({
      where: scoped(viewer, { OR: [{ claimedAt: within }, { deliveredAt: within }, { failedAt: within }] }),
      select: {
        claimedAt: true, pickedUpAt: true, deliveredAt: true, failedAt: true, failureReason: true,
        rider: { select: { id: true, displayName: true, avatarUpdatedAt: true, riderProfile: { select: { riderCode: true, employmentCategory: true } } } },
        deliveryRequest: { select: { deliveryZone: { select: { subdistrictCode: true, subdistrictName: true, displayName: true } } } },
      },
    });
    const summary = summarizeDeliveries(range, attempts);

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      return csvResponse('delivery-report', range, toCsv(
        ['รหัสไรเดอร์', 'ชื่อไรเดอร์', 'ประเภท', 'รับงาน', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ', 'อัตราสำเร็จ (%)', 'เวลาส่งเฉลี่ย (นาที)'],
        [
          ...summary.byRider.map((row) => [row.riderCode, row.displayName, row.employmentCategory ? employmentLabels[row.employmentCategory] : null, row.claimed, row.delivered, row.failed, row.successRate, row.averageMinutes]),
          ['', 'รวม', '', summary.totals.claimed, summary.totals.delivered, summary.totals.failed, summary.totals.successRate, summary.totals.averageMinutes],
          [],
          ['ตำบล', 'โซน', 'ส่งสำเร็จ', 'ส่งไม่สำเร็จ', 'อัตราสำเร็จ (%)'],
          ...summary.byZone.map((row) => [row.subdistrictCode, row.zone, row.delivered, row.failed, row.successRate]),
          [],
          ['สาเหตุที่ส่งไม่สำเร็จ', 'จำนวน'],
          ...summary.failureReasons.map((row) => [failureReasonLabels[row.reason as keyof typeof failureReasonLabels] ?? row.reason, row.count]),
        ],
      ));
    }
    return NextResponse.json({ from: range.from, to: range.to, ...summary }, { headers: { 'cache-control': 'no-store' } });
  });
}
