import { expect, test } from 'vitest';
import { pageOfHistory, parseHistoryQuery } from '@/domain/delivery/rider-history';

const now = new Date('2026-10-14T13:00:00.000Z'); // 20:00 in Bangkok

test('defaults to the last seven Bangkok days, first page, all outcomes', () => {
  const query = parseHistoryQuery(new URLSearchParams(), now);
  expect(query).toMatchObject({ from: '2026-10-08', to: '2026-10-14', outcome: 'all', page: 1 });
  if ('error' in query) throw new Error(query.error);
  expect(query.start.toISOString()).toBe('2026-10-07T17:00:00.000Z');
  expect(query.end.toISOString()).toBe('2026-10-14T17:00:00.000Z');
});

test('rejects reversed, oversized or malformed ranges', () => {
  expect(parseHistoryQuery(new URLSearchParams({ from: '2026-10-14', to: '2026-10-01' }), now)).toEqual({ error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' });
  expect(parseHistoryQuery(new URLSearchParams({ from: '2026-01-01', to: '2026-10-14' }), now)).toEqual({ error: 'เลือกช่วงวันที่ได้ไม่เกิน 92 วัน' });
  expect(parseHistoryQuery(new URLSearchParams({ from: '2026-02-30' }), now)).toEqual({ error: 'วันที่ไม่ถูกต้อง' });
  expect(parseHistoryQuery(new URLSearchParams({ outcome: 'claimed' }), now)).toEqual({ error: 'สถานะไม่ถูกต้อง' });
  expect(parseHistoryQuery(new URLSearchParams({ page: '0' }), now)).toEqual({ error: 'หน้าไม่ถูกต้อง' });
});

const at = (minute: number) => new Date(Date.UTC(2026, 9, 14, 3, minute));
const attempts = Array.from({ length: 23 }, (_, index) => ({
  id: `A${index}`,
  deliveredAt: index % 3 === 0 ? null : at(index),
  failedAt: index % 3 === 0 ? at(index) : null,
}));

test('pages ten at a time, newest first, with counts for the whole range', () => {
  const first = pageOfHistory(attempts, 'all', 1);
  expect(first.items.map((item) => item.id)).toEqual(['A22', 'A21', 'A20', 'A19', 'A18', 'A17', 'A16', 'A15', 'A14', 'A13']);
  expect(first).toMatchObject({ total: 23, pages: 3, counts: { delivered: 15, failed: 8 } });
  expect(pageOfHistory(attempts, 'all', 3).items.map((item) => item.id)).toEqual(['A2', 'A1', 'A0']);
});

test('filters by outcome without changing the counts', () => {
  const failed = pageOfHistory(attempts, 'failed', 1);
  expect(failed.items.every((item) => item.failedAt !== null)).toBe(true);
  expect(failed).toMatchObject({ total: 8, pages: 1, counts: { delivered: 15, failed: 8 } });
  expect(pageOfHistory([], 'all', 1)).toMatchObject({ items: [], total: 0, pages: 1 });
});
