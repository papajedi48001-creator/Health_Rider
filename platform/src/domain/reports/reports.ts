import { bangkokDateString, startOfBangkokDay } from '@/lib/time';
import { shortCode } from '@/lib/labels';

// Keeps one report bounded to about a quarter, enough for a monthly or quarterly summary.
export const maxReportDays = 92;
const dayMs = 24 * 60 * 60 * 1000;

export type ReportRange = { from: string; to: string; start: Date; end: Date };

// Defaults to the current Bangkok month up to today.
export function parseReportRange(params: URLSearchParams, now = new Date()): ReportRange | { error: string } {
  const today = bangkokDateString(now);
  const from = params.get('from') || `${today.slice(0, 8)}01`;
  const to = params.get('to') || today;
  const start = startOfBangkokDay(from);
  const toStart = startOfBangkokDay(to);
  if (!start || !toStart) return { error: 'วันที่ไม่ถูกต้อง' };
  if (start > toStart) return { error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' };
  const end = new Date(toStart.getTime() + dayMs);
  if (end.getTime() - start.getTime() > maxReportDays * dayMs) return { error: `เลือกช่วงวันที่ได้ไม่เกิน ${maxReportDays} วัน` };
  return { from, to, start, end };
}

export function dateRangeFilter(range: ReportRange) {
  return { gte: range.start, lt: range.end };
}

function inRange(range: ReportRange, value: Date | null): value is Date {
  return value !== null && value >= range.start && value < range.end;
}

function daysOf(range: ReportRange): string[] {
  const days: string[] = [];
  for (let time = range.start.getTime(); time < range.end.getTime(); time += dayMs) days.push(bangkokDateString(new Date(time)));
  return days;
}

function rate(delivered: number, failed: number): number | null {
  return delivered + failed === 0 ? null : Math.round((delivered / (delivered + failed)) * 100);
}

function tallyReasons(reasons: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const reason of reasons) if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((left, right) => right.count - left.count);
}

type Zone = { subdistrictCode: string; subdistrictName: string | null; displayName: string };

export type PharmacyInput = {
  requests: Array<{ createdAt: Date; deliveryZone: Zone }>;
  attempts: Array<{ deliveredAt: Date | null; failedAt: Date | null; returnedAt: Date | null; failureReason: string | null; deliveryRequest: { deliveryZone: Zone } }>;
  backlog: Record<'prepared' | 'claimed' | 'in_transit' | 'return_required' | 'sync_review', number>;
};

// Pharmacy's view: how many patients were confirmed, how their medicine ended up, and where.
export function summarizePharmacy(range: ReportRange, input: PharmacyInput) {
  const days = new Map(daysOf(range).map((date) => [date, { date, confirmed: 0, delivered: 0, failed: 0, returned: 0 }]));
  const subdistricts = new Map<string, { subdistrictCode: string; subdistrictName: string | null; confirmed: number; delivered: number; failed: number; returned: number }>();
  const subdistrict = (zone: Zone) => {
    const row = subdistricts.get(zone.subdistrictCode)
      ?? { subdistrictCode: zone.subdistrictCode, subdistrictName: zone.subdistrictName, confirmed: 0, delivered: 0, failed: 0, returned: 0 };
    subdistricts.set(zone.subdistrictCode, row);
    return row;
  };
  const totals = { confirmed: 0, delivered: 0, failed: 0, returned: 0 };
  const count = (key: 'confirmed' | 'delivered' | 'failed' | 'returned', at: Date, zone: Zone) => {
    totals[key] += 1;
    subdistrict(zone)[key] += 1;
    const day = days.get(bangkokDateString(at));
    if (day) day[key] += 1;
  };

  for (const request of input.requests) if (inRange(range, request.createdAt)) count('confirmed', request.createdAt, request.deliveryZone);
  const failedReasons: Array<string | null> = [];
  for (const attempt of input.attempts) {
    const zone = attempt.deliveryRequest.deliveryZone;
    if (inRange(range, attempt.deliveredAt)) count('delivered', attempt.deliveredAt, zone);
    if (inRange(range, attempt.failedAt)) {
      count('failed', attempt.failedAt, zone);
      failedReasons.push(attempt.failureReason);
    }
    if (inRange(range, attempt.returnedAt)) count('returned', attempt.returnedAt, zone);
  }

  return {
    totals: { ...totals, successRate: rate(totals.delivered, totals.failed) },
    bySubdistrict: [...subdistricts.values()].sort((left, right) => left.subdistrictCode.localeCompare(right.subdistrictCode)),
    byDay: [...days.values()],
    failureReasons: tallyReasons(failedReasons),
    backlog: input.backlog,
  };
}

type Rider = { id: string; displayName: string; riderProfile: { riderCode: string; employmentCategory: string } | null };

export type DeliveryInput = Array<{
  claimedAt: Date | null; pickedUpAt: Date | null; deliveredAt: Date | null; failedAt: Date | null; failureReason: string | null;
  rider: Rider | null; deliveryRequest: { deliveryZone: Zone };
}>;

function average(values: number[]): number | null {
  return values.length === 0 ? null : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

// The coordinator's view: each rider's and zone's results, and how long a delivery takes after pickup.
export function summarizeDeliveries(range: ReportRange, attempts: DeliveryInput) {
  const riders = new Map<string, { rider: Rider; claimed: number; delivered: number; failed: number; minutes: number[] }>();
  const zones = new Map<string, { zone: string; subdistrictCode: string; delivered: number; failed: number }>();
  const totals = { claimed: 0, delivered: 0, failed: 0 };
  const minutes: number[] = [];
  const failedReasons: Array<string | null> = [];

  for (const attempt of attempts) {
    const riderRow = attempt.rider && (riders.get(attempt.rider.id) ?? { rider: attempt.rider, claimed: 0, delivered: 0, failed: 0, minutes: [] });
    if (riderRow && attempt.rider) riders.set(attempt.rider.id, riderRow);
    const zone = attempt.deliveryRequest.deliveryZone;
    const zoneKey = `${zone.subdistrictCode}:${zone.displayName}`;
    const zoneRow = zones.get(zoneKey) ?? { zone: zone.displayName, subdistrictCode: zone.subdistrictCode, delivered: 0, failed: 0 };
    zones.set(zoneKey, zoneRow);

    if (inRange(range, attempt.claimedAt)) {
      totals.claimed += 1;
      if (riderRow) riderRow.claimed += 1;
    }
    if (inRange(range, attempt.deliveredAt)) {
      totals.delivered += 1;
      zoneRow.delivered += 1;
      if (riderRow) riderRow.delivered += 1;
      if (attempt.pickedUpAt) {
        const taken = (attempt.deliveredAt.getTime() - attempt.pickedUpAt.getTime()) / 60_000;
        minutes.push(taken);
        riderRow?.minutes.push(taken);
      }
    }
    if (inRange(range, attempt.failedAt)) {
      totals.failed += 1;
      zoneRow.failed += 1;
      if (riderRow) riderRow.failed += 1;
      failedReasons.push(attempt.failureReason);
    }
  }

  return {
    totals: { ...totals, successRate: rate(totals.delivered, totals.failed), averageMinutes: average(minutes) },
    byRider: [...riders.values()]
      .map((row) => ({
        riderId: row.rider.id,
        displayName: row.rider.displayName,
        riderCode: row.rider.riderProfile?.riderCode ?? null,
        employmentCategory: row.rider.riderProfile?.employmentCategory ?? null,
        claimed: row.claimed,
        delivered: row.delivered,
        failed: row.failed,
        successRate: rate(row.delivered, row.failed),
        averageMinutes: average(row.minutes),
      }))
      .sort((left, right) => right.delivered - left.delivered || left.displayName.localeCompare(right.displayName, 'th')),
    byZone: [...zones.values()]
      .filter((row) => row.delivered + row.failed > 0)
      .map((row) => ({ ...row, successRate: rate(row.delivered, row.failed) }))
      .sort((left, right) => left.subdistrictCode.localeCompare(right.subdistrictCode) || left.zone.localeCompare(right.zone, 'th')),
    failureReasons: tallyReasons(failedReasons),
  };
}

export type FeeInput = Array<{ id: string; deliveredAt: Date | null; rider: Rider | null; deliveryRequest: { rateSatang: number | null; rateBackfilled?: boolean; deliveryZone: Zone } }>;

// Admin's payout view: one fee per delivered job, at the rate fixed when pharmacy confirmed the request;
// rateBackfilled marks a job priced afterwards from the rate table because none applied when it was confirmed.
export function summarizeFees(attempts: FeeInput) {
  const riders = new Map<string, { rider: Rider; deliveries: number; totalSatang: number; unpriced: number }>();
  const totals = { deliveries: 0, totalSatang: 0, unpriced: 0, backfilled: 0 };
  const delivered = attempts
    .filter((attempt): attempt is FeeInput[number] & { deliveredAt: Date; rider: Rider } => attempt.deliveredAt !== null && attempt.rider !== null)
    .sort((left, right) => left.deliveredAt.getTime() - right.deliveredAt.getTime());

  for (const attempt of delivered) {
    const row = riders.get(attempt.rider.id) ?? { rider: attempt.rider, deliveries: 0, totalSatang: 0, unpriced: 0 };
    riders.set(attempt.rider.id, row);
    const fee = attempt.deliveryRequest.rateSatang;
    row.deliveries += 1;
    totals.deliveries += 1;
    if (fee === null) {
      row.unpriced += 1;
      totals.unpriced += 1;
    } else {
      row.totalSatang += fee;
      totals.totalSatang += fee;
      if (attempt.deliveryRequest.rateBackfilled) totals.backfilled += 1;
    }
  }

  return {
    totals,
    byRider: [...riders.values()]
      .map((row) => ({
        riderId: row.rider.id,
        displayName: row.rider.displayName,
        riderCode: row.rider.riderProfile?.riderCode ?? null,
        employmentCategory: row.rider.riderProfile?.employmentCategory ?? null,
        deliveries: row.deliveries,
        totalSatang: row.totalSatang,
        unpriced: row.unpriced,
      }))
      .sort((left, right) => (left.riderCode ?? '').localeCompare(right.riderCode ?? '') || left.displayName.localeCompare(right.displayName, 'th')),
    lines: delivered.map((attempt) => ({
      date: bangkokDateString(attempt.deliveredAt),
      riderCode: attempt.rider.riderProfile?.riderCode ?? null,
      displayName: attempt.rider.displayName,
      packageCode: shortCode(attempt.id),
      subdistrictCode: attempt.deliveryRequest.deliveryZone.subdistrictCode,
      zone: attempt.deliveryRequest.deliveryZone.displayName,
      rateSatang: attempt.deliveryRequest.rateSatang,
      rateBackfilled: attempt.deliveryRequest.rateBackfilled === true,
    })),
  };
}

// Text that a spreadsheet would read as a formula (=, +, -, @, tab, CR) gets a leading apostrophe,
// because names such as a rider's display name are typed by users. Numbers are written as they are.
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  const text = typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

// A byte-order mark makes Excel read the Thai text as UTF-8.
export function toCsv(headers: string[], rows: Array<Array<string | number | null>>): string {
  return `﻿${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function csvResponse(name: string, range: ReportRange, body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${name}-${range.from}-${range.to}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
