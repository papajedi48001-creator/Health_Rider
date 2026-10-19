import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { scoped } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { historyPageSize, historyWhere, parseHistoryFilters } from '@/domain/reports/history-search';
import { csvResponse, dateRangeFilter, parseReportRange, toCsv } from '@/domain/reports/reports';
import { db } from '@/lib/db';
import { failureReasonLabels, formatThaiDateTime, shortCode, statusLabels } from '@/lib/labels';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const csvLimit = 5000;

// Searches delivery history by patient HN, rider, subdistrict, village zone and status within a date range.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const viewer = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const params = request.nextUrl.searchParams;
    const range = parseReportRange(params);
    if ('error' in range) return invalidInput(range.error);
    const filters = parseHistoryFilters(params);
    const where = scoped(viewer, historyWhere(filters, dateRangeFilter(range)));
    const asCsv = params.get('format') === 'csv';

    const [total, attempts] = await Promise.all([
      db.deliveryAttempt.count({ where }),
      db.deliveryAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: asCsv ? 0 : (filters.page - 1) * historyPageSize,
        take: asCsv ? csvLimit : historyPageSize,
        select: {
          id: true, status: true, createdAt: true, claimedAt: true, deliveredAt: true, failedAt: true, failureReason: true,
          rider: { select: { id: true, displayName: true, avatarUpdatedAt: true, riderProfile: { select: { riderCode: true } } } },
          deliveryRequest: {
            select: { hn: true, patientName: true, deliveryZone: { select: { subdistrictCode: true, subdistrictName: true, displayName: true } } },
          },
        },
      }),
    ]);
    const items = attempts.map((attempt) => ({
      id: attempt.id,
      packageCode: shortCode(attempt.id),
      status: attempt.status,
      hn: attempt.deliveryRequest.hn,
      patientName: attempt.deliveryRequest.patientName,
      subdistrict: attempt.deliveryRequest.deliveryZone.subdistrictName ?? attempt.deliveryRequest.deliveryZone.subdistrictCode,
      zone: attempt.deliveryRequest.deliveryZone.displayName,
      rider: attempt.rider && { id: attempt.rider.id, displayName: attempt.rider.displayName, avatarUpdatedAt: attempt.rider.avatarUpdatedAt, riderCode: attempt.rider.riderProfile?.riderCode ?? null },
      createdAt: attempt.createdAt,
      finishedAt: attempt.deliveredAt ?? attempt.failedAt,
      failureReason: attempt.failureReason,
    }));

    if (asCsv) {
      return csvResponse('delivery-history', range, toCsv(
        ['พัสดุ', 'HN', 'ผู้ป่วย', 'ตำบล', 'โซน', 'รหัสไรเดอร์', 'ไรเดอร์', 'สถานะ', 'เตรียมพัสดุ', 'ส่งเสร็จ/ไม่สำเร็จ', 'สาเหตุที่ส่งไม่สำเร็จ'],
        items.map((item) => [
          item.packageCode, item.hn, item.patientName, item.subdistrict, item.zone, item.rider?.riderCode ?? null, item.rider?.displayName ?? null,
          statusLabels[item.status], formatThaiDateTime(item.createdAt), formatThaiDateTime(item.finishedAt),
          item.failureReason ? failureReasonLabels[item.failureReason as keyof typeof failureReasonLabels] ?? item.failureReason : null,
        ]),
      ));
    }
    return NextResponse.json({
      from: range.from, to: range.to, page: filters.page, pages: Math.max(1, Math.ceil(total / historyPageSize)), total, items,
    }, { headers: { 'cache-control': 'no-store' } });
  });
}
