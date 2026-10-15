import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { csvResponse, dateRangeFilter, parseReportRange, summarizeFees, toCsv } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { employmentLabels } from '@/lib/labels';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const baht = (satang: number | null) => (satang === null ? null : (satang / 100).toFixed(2));

// Admin's payout report: delivered jobs per rider at the rate fixed on each request; the CSV lists every job.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const range = parseReportRange(request.nextUrl.searchParams);
    if ('error' in range) return invalidInput(range.error);

    const attempts = await db.deliveryAttempt.findMany({
      where: { deliveredAt: dateRangeFilter(range) },
      select: {
        id: true, deliveredAt: true,
        rider: { select: { id: true, displayName: true, riderProfile: { select: { riderCode: true, employmentCategory: true } } } },
        deliveryRequest: { select: { rateSatang: true, deliveryZone: { select: { subdistrictCode: true, subdistrictName: true, displayName: true } } } },
      },
    });
    const summary = summarizeFees(attempts);

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      return csvResponse('rider-fees', range, toCsv(
        ['รหัสไรเดอร์', 'ชื่อไรเดอร์', 'ประเภท', 'จำนวนงานส่งสำเร็จ', 'ค่าบริการรวม (บาท)', 'งานที่ยังไม่มีราคา'],
        [
          ...summary.byRider.map((row) => [row.riderCode, row.displayName, row.employmentCategory ? employmentLabels[row.employmentCategory] : null, row.deliveries, baht(row.totalSatang), row.unpriced]),
          ['', 'รวม', '', summary.totals.deliveries, baht(summary.totals.totalSatang), summary.totals.unpriced],
          [],
          ['วันที่ส่ง', 'รหัสไรเดอร์', 'ชื่อไรเดอร์', 'รหัสพัสดุ', 'ตำบล', 'โซน', 'ค่าบริการ (บาท)'],
          ...summary.lines.map((line) => [line.date, line.riderCode, line.displayName, line.packageCode, line.subdistrictCode, line.zone, baht(line.rateSatang)]),
        ],
      ));
    }
    return NextResponse.json({ from: range.from, to: range.to, totals: summary.totals, byRider: summary.byRider }, { headers: { 'cache-control': 'no-store' } });
  });
}
