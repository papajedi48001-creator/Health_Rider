import { expect, test } from 'vitest';
import { bangkokDateString, isSameBangkokDay, startOfBangkokDay } from '@/lib/time';

test('uses the Thai calendar day rather than the UTC day', () => {
  expect(bangkokDateString(new Date('2026-10-13T18:30:00.000Z'))).toBe('2026-10-14');
  expect(bangkokDateString(new Date('2026-10-14T16:59:59.000Z'))).toBe('2026-10-14');
  expect(bangkokDateString(new Date('2026-10-14T17:00:00.000Z'))).toBe('2026-10-15');
});

test('compares same-day returns in Thai time', () => {
  expect(isSameBangkokDay(new Date('2026-10-13T18:00:00.000Z'), new Date('2026-10-14T10:00:00.000Z'))).toBe(true);
  expect(isSameBangkokDay(new Date('2026-10-13T16:00:00.000Z'), new Date('2026-10-13T18:00:00.000Z'))).toBe(false);
});

test('parses a requested Thai date and rejects invalid dates', () => {
  expect(startOfBangkokDay('2026-10-14')?.toISOString()).toBe('2026-10-13T17:00:00.000Z');
  expect(startOfBangkokDay('2026-02-30')).toBeNull();
  expect(startOfBangkokDay('14/10/2026')).toBeNull();
});
