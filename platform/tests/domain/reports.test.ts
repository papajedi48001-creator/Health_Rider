import { expect, test } from 'vitest';
import { parseReportRange, summarizeDeliveries, summarizeFees, summarizePharmacy, toCsv } from '@/domain/reports/reports';

const zoneA = { subdistrictCode: '440801', subdistrictName: 'ตำบลเอ', displayName: 'หมู่ 1' };
const zoneB = { subdistrictCode: '440802', subdistrictName: null, displayName: 'หมู่ 2' };
const range = parseReportRange(new URLSearchParams('from=2026-10-01&to=2026-10-02'), new Date('2026-10-15T00:00:00Z'));

test('defaults to the current Bangkok month and rejects bad or long ranges', () => {
  expect(parseReportRange(new URLSearchParams(), new Date('2026-10-14T20:00:00Z'))).toMatchObject({ from: '2026-10-01', to: '2026-10-15' });
  expect(parseReportRange(new URLSearchParams('from=2026-10-05&to=2026-10-01'))).toEqual({ error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' });
  expect(parseReportRange(new URLSearchParams('from=2026-01-01&to=2026-10-01'))).toEqual({ error: 'เลือกช่วงวันที่ได้ไม่เกิน 92 วัน' });
  expect(parseReportRange(new URLSearchParams('from=2026-02-30'))).toEqual({ error: 'วันที่ไม่ถูกต้อง' });
});

test('pharmacy summary counts confirmations and outcomes by subdistrict and Bangkok day', () => {
  if ('error' in range) throw new Error(range.error);
  const summary = summarizePharmacy(range, {
    requests: [
      { createdAt: new Date('2026-09-30T18:00:00Z'), deliveryZone: zoneA },
      { createdAt: new Date('2026-10-02T03:00:00Z'), deliveryZone: zoneB },
    ],
    attempts: [
      { deliveredAt: new Date('2026-10-01T05:00:00Z'), failedAt: null, returnedAt: null, failureReason: null, deliveryRequest: { deliveryZone: zoneA } },
      { deliveredAt: null, failedAt: new Date('2026-10-02T05:00:00Z'), returnedAt: new Date('2026-10-02T09:00:00Z'), failureReason: 'address_not_found', deliveryRequest: { deliveryZone: zoneB } },
      { deliveredAt: null, failedAt: new Date('2026-09-20T05:00:00Z'), returnedAt: new Date('2026-10-01T02:00:00Z'), failureReason: 'recipient_unavailable', deliveryRequest: { deliveryZone: zoneB } },
    ],
    backlog: { prepared: 3, claimed: 1, in_transit: 2, return_required: 1, sync_review: 0 },
  });

  expect(summary.totals).toEqual({ confirmed: 2, delivered: 1, failed: 1, returned: 2, successRate: 50 });
  expect(summary.bySubdistrict).toEqual([
    { subdistrictCode: '440801', subdistrictName: 'ตำบลเอ', confirmed: 1, delivered: 1, failed: 0, returned: 0 },
    { subdistrictCode: '440802', subdistrictName: null, confirmed: 1, delivered: 0, failed: 1, returned: 2 },
  ]);
  expect(summary.byDay).toEqual([
    { date: '2026-10-01', confirmed: 1, delivered: 1, failed: 0, returned: 1 },
    { date: '2026-10-02', confirmed: 1, delivered: 0, failed: 1, returned: 1 },
  ]);
  expect(summary.failureReasons).toEqual([{ reason: 'address_not_found', count: 1 }]);
  expect(summary.backlog).toEqual({ prepared: 3, claimed: 1, in_transit: 2, return_required: 1, sync_review: 0 });
});

const riderOne = { id: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderProfile: { riderCode: 'R-01', employmentCategory: 'internal' } };
const riderTwo = { id: 'R2', displayName: 'ไรเดอร์สอง', riderProfile: { riderCode: 'R-02', employmentCategory: 'external' } };

test('delivery summary ranks riders and measures pickup-to-delivery time', () => {
  if ('error' in range) throw new Error(range.error);
  const summary = summarizeDeliveries(range, [
    { claimedAt: new Date('2026-10-01T01:00:00Z'), pickedUpAt: new Date('2026-10-01T02:00:00Z'), deliveredAt: new Date('2026-10-01T02:40:00Z'), failedAt: null, failureReason: null, rider: riderOne, deliveryRequest: { deliveryZone: zoneA } },
    { claimedAt: new Date('2026-10-01T01:00:00Z'), pickedUpAt: new Date('2026-10-01T02:00:00Z'), deliveredAt: new Date('2026-10-01T03:00:00Z'), failedAt: null, failureReason: null, rider: riderOne, deliveryRequest: { deliveryZone: zoneA } },
    { claimedAt: new Date('2026-10-02T01:00:00Z'), pickedUpAt: null, deliveredAt: null, failedAt: new Date('2026-10-02T04:00:00Z'), failureReason: 'recipient_unavailable', rider: riderTwo, deliveryRequest: { deliveryZone: zoneB } },
    { claimedAt: new Date('2026-10-02T06:00:00Z'), pickedUpAt: null, deliveredAt: null, failedAt: null, failureReason: null, rider: riderTwo, deliveryRequest: { deliveryZone: zoneB } },
  ]);

  expect(summary.totals).toEqual({ claimed: 4, delivered: 2, failed: 1, successRate: 67, averageMinutes: 50 });
  expect(summary.byRider).toEqual([
    { riderId: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderCode: 'R-01', employmentCategory: 'internal', claimed: 2, delivered: 2, failed: 0, successRate: 100, averageMinutes: 50 },
    { riderId: 'R2', displayName: 'ไรเดอร์สอง', riderCode: 'R-02', employmentCategory: 'external', claimed: 2, delivered: 0, failed: 1, successRate: 0, averageMinutes: null },
  ]);
  expect(summary.byZone).toEqual([
    { zone: 'หมู่ 1', subdistrictCode: '440801', delivered: 2, failed: 0, successRate: 100 },
    { zone: 'หมู่ 2', subdistrictCode: '440802', delivered: 0, failed: 1, successRate: 0 },
  ]);
  expect(summary.failureReasons).toEqual([{ reason: 'recipient_unavailable', count: 1 }]);
});

test('fee summary totals delivered jobs at the rate fixed on each request', () => {
  const summary = summarizeFees([
    { id: 'ATTEMPT00001', deliveredAt: new Date('2026-10-01T05:00:00Z'), rider: riderOne, deliveryRequest: { rateSatang: 3000, deliveryZone: zoneA } },
    { id: 'ATTEMPT00002', deliveredAt: new Date('2026-10-02T05:00:00Z'), rider: riderOne, deliveryRequest: { rateSatang: 4500, deliveryZone: zoneB } },
    { id: 'ATTEMPT00003', deliveredAt: new Date('2026-10-02T06:00:00Z'), rider: riderTwo, deliveryRequest: { rateSatang: null, deliveryZone: zoneB } },
  ]);

  expect(summary.totals).toEqual({ deliveries: 3, totalSatang: 7500, unpriced: 1, backfilled: 0 });
  expect(summary.byRider).toEqual([
    { riderId: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderCode: 'R-01', employmentCategory: 'internal', deliveries: 2, totalSatang: 7500, unpriced: 0 },
    { riderId: 'R2', displayName: 'ไรเดอร์สอง', riderCode: 'R-02', employmentCategory: 'external', deliveries: 1, totalSatang: 0, unpriced: 1 },
  ]);
  expect(summary.lines[0]).toEqual({ date: '2026-10-01', riderCode: 'R-01', displayName: 'ไรเดอร์หนึ่ง', packageCode: 'T00001', subdistrictCode: '440801', zone: 'หมู่ 1', rateSatang: 3000, rateBackfilled: false });
});

test('CSV opens in Excel with Thai text and quoted commas', () => {
  expect(toCsv(['ชื่อ', 'จำนวน'], [['ก, ข', 2], ['"ค"', null]])).toBe('﻿ชื่อ,จำนวน\r\n"ก, ข",2\r\n"""ค""",\r\n');
});
