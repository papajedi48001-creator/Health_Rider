import { expect, test } from 'vitest';
import { calendarDate, parseServiceRate, resolveRate } from '@/domain/delivery/service-rate';

const zone = { id: 'zone-6', subdistrictCode: '470603' };
const rate = (deliveryZoneId: string | null, rateSatang: number, effectiveFrom: string, subdistrictCode = '470603') =>
  ({ subdistrictCode, deliveryZoneId, rateSatang, effectiveFrom: calendarDate(effectiveFrom) });

test('a zone rate wins over a whole-subdistrict rate, and the latest rate already in effect applies', () => {
  const rates = [rate(null, 3000, '2026-01-01'), rate(null, 3500, '2026-10-01'), rate('zone-6', 5000, '2026-11-01'), rate(null, 9900, '2026-01-01', '470602')];

  expect(resolveRate(rates, zone, calendarDate('2026-09-30'))).toEqual({ rateSatang: 3000, rateEffectiveFrom: calendarDate('2026-01-01') });
  expect(resolveRate(rates, zone, calendarDate('2026-10-14'))).toEqual({ rateSatang: 3500, rateEffectiveFrom: calendarDate('2026-10-01') });
  expect(resolveRate(rates, zone, calendarDate('2026-11-01'))).toEqual({ rateSatang: 5000, rateEffectiveFrom: calendarDate('2026-11-01') });
  expect(resolveRate(rates, { id: 'zone-x', subdistrictCode: '470601' }, calendarDate('2026-11-01'))).toBeNull();
});

test('reads baht as satang and rejects bad amounts and dates', () => {
  expect(parseServiceRate({ subdistrictCode: '470603', deliveryZoneId: '', baht: '35.50', effectiveFrom: '2026-11-01' }))
    .toEqual({ subdistrictCode: '470603', deliveryZoneId: null, rateSatang: 3550, effectiveFrom: calendarDate('2026-11-01') });
  expect(() => parseServiceRate({ subdistrictCode: '470603', baht: '0', effectiveFrom: '2026-11-01' })).toThrow('มากกว่า 0');
  expect(() => parseServiceRate({ subdistrictCode: '470603', baht: '1.234', effectiveFrom: '2026-11-01' })).toThrow('ทศนิยม');
  expect(() => parseServiceRate({ subdistrictCode: '470603', baht: '30', effectiveFrom: '2026-02-30' })).toThrow('วันเริ่มใช้');
});

test('a rate added later for the same start date replaces the earlier one', () => {
  const rates = [
    { ...rate(null, 3000, '2026-10-14'), createdAt: new Date('2026-10-14T05:00:00.000Z') },
    { ...rate(null, 2000, '2026-10-14'), createdAt: new Date('2026-10-14T06:00:00.000Z') },
  ];

  expect(resolveRate(rates, zone, calendarDate('2026-10-14'))?.rateSatang).toBe(2000);
  expect(resolveRate([...rates].reverse(), zone, calendarDate('2026-10-14'))?.rateSatang).toBe(2000);
});

test('a job confirmed before its zone had a price takes the subdistrict rate, even one set later', async () => {
  const { rateForUnpricedJob } = await import('@/domain/delivery/service-rate');
  const zone = { id: 'zone-6', subdistrictCode: '470602' };
  const subdistrictOnly = [
    { subdistrictCode: '470602', deliveryZoneId: null, rateSatang: 4000, effectiveFrom: calendarDate('2026-10-15') },
    { subdistrictCode: '470602', deliveryZoneId: null, rateSatang: 4500, effectiveFrom: calendarDate('2026-11-01') },
  ];
  expect(rateForUnpricedJob(subdistrictOnly, zone, calendarDate('2026-10-14'))?.rateSatang).toBe(4000);
  expect(rateForUnpricedJob(subdistrictOnly, zone, calendarDate('2026-11-02'))?.rateSatang).toBe(4500);
  const withZone = [...subdistrictOnly, { subdistrictCode: '470602', deliveryZoneId: 'zone-6', rateSatang: 5000, effectiveFrom: calendarDate('2026-10-20') }];
  expect(rateForUnpricedJob(withZone, zone, calendarDate('2026-10-14'))?.rateSatang).toBe(5000);
  expect(rateForUnpricedJob(withZone, { id: 'other', subdistrictCode: '470699' }, calendarDate('2026-10-14'))).toBeNull();
});
