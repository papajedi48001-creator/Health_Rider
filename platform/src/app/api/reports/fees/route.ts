import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { csvResponse, dateRangeFilter, parseReportRange, summarizeFees, toCsv } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { calendarDate, rateForUnpricedJob } from '@/domain/delivery/service-rate';
import { employmentLabels } from '@/lib/labels';
import { bangkokDateString } from '@/lib/time';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const baht = (satang: number | null) => (satang === null ? null : (satang / 100).toFixed(2));

// Admin's payout report: delivered jobs per rider at the rate fixed on each request; the CSV lists every job.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const range = parseReportRange(request.nextUrl.searchParams);
    if ('error' in range) return invalidInput(range.error);

    const [attempts, rates] = await Promise.all([
      db.deliveryAttempt.findMany({
        where: { deliveredAt: dateRangeFilter(range) },
        select: {
          id: true, deliveredAt: true,
          rider: { select: { id: true, displayName: true, riderProfile: { select: { riderCode: true, employmentCategory: true } } } },
          deliveryRequest: {
            select: { createdAt: true, rateSatang: true, deliveryZone: { select: { id: true, subdistrictCode: true, subdistrictName: true, displayName: true } } },
          },
        },
      }),
      db.serviceRate.findMany({ select: { subdistrictCode: true, deliveryZoneId: true, rateSatang: true, effectiveFrom: true, createdAt: true } }),
    ]);
    // Jobs confirmed before their zone or subdistrict had a price are priced from the rate table now.
    const priced = attempts.map((attempt) => {
      if (attempt.deliveryRequest.rateSatang !== null) return attempt;
      const zone = attempt.deliveryRequest.deliveryZone;
      const rate = rateForUnpricedJob(rates, zone, calendarDate(bangkokDateString(attempt.deliveryRequest.createdAt)));
      return rate ? { ...attempt, deliveryRequest: { ...attempt.deliveryRequest, rateSatang: rate.rateSatang, rateBackfilled: true } } : attempt;
    });
    const summary = summarizeFees(priced);

    if (request.nextUrl.searchParams.get('format') === 'csv') {
      return csvResponse('rider-fees', range, toCsv(
        ['รหัสไรเดอร์', 'ชื่อไรเดอร์', 'ประเภท', 'จำนวนงานส่งสำเร็จ', 'ค่าบริการรวม (บาท)', 'งานที่ยังไม่มีราคา'],
        [
          ...summary.byRider.map((row) => [row.riderCode, row.displayName, row.employmentCategory ? employmentLabels[row.employmentCategory] : null, row.deliveries, baht(row.totalSatang), row.unpriced]),
          ['', 'รวม', '', summary.totals.deliveries, baht(summary.totals.totalSatang), summary.totals.unpriced],
          [],
          ['วันที่ส่ง', 'รหัสไรเดอร์', 'ชื่อไรเดอร์', 'รหัสพัสดุ', 'ตำบล', 'โซน', 'ค่าบริการ (บาท)', 'หมายเหตุ'],
          ...summary.lines.map((line) => [line.date, line.riderCode, line.displayName, line.packageCode, line.subdistrictCode, line.zone, baht(line.rateSatang), line.rateBackfilled ? 'ใช้ราคาที่ตั้งภายหลังการยืนยัน' : null]),
        ],
      ));
    }
    return NextResponse.json({ from: range.from, to: range.to, totals: summary.totals, byRider: summary.byRider }, { headers: { 'cache-control': 'no-store' } });
  });
}
