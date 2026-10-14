import { bangkokDateString, startOfBangkokDay } from '@/lib/time';

export const historyPageSize = 10;
// Keeps one request bounded: a rider's finished attempts for at most about three months.
export const maxHistoryDays = 92;
const dayMs = 24 * 60 * 60 * 1000;

export type HistoryOutcome = 'delivered' | 'failed';
export type HistoryFilter = 'all' | HistoryOutcome;
export type HistoryQuery = { from: string; to: string; start: Date; end: Date; outcome: HistoryFilter; page: number };

// A delivered attempt counts on the day it was delivered; a failed one on the day the failure was recorded.
export type FinishedAttempt = { deliveredAt: Date | null; failedAt: Date | null };

export function outcomeOf(attempt: FinishedAttempt): HistoryOutcome {
  return attempt.deliveredAt ? 'delivered' : 'failed';
}

export function finishedAt(attempt: FinishedAttempt): Date {
  return (attempt.deliveredAt ?? attempt.failedAt) as Date;
}

// Defaults to the last seven Bangkok days; returns an error message for anything a rider could not have picked.
export function parseHistoryQuery(params: URLSearchParams, now = new Date()): HistoryQuery | { error: string } {
  const today = bangkokDateString(now);
  const to = params.get('to') || today;
  const from = params.get('from') || bangkokDateString(new Date(now.getTime() - 6 * dayMs));
  const start = startOfBangkokDay(from);
  const toStart = startOfBangkokDay(to);
  if (!start || !toStart) return { error: 'วันที่ไม่ถูกต้อง' };
  if (start > toStart) return { error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' };
  const end = new Date(toStart.getTime() + dayMs);
  if (end.getTime() - start.getTime() > maxHistoryDays * dayMs) return { error: `เลือกช่วงวันที่ได้ไม่เกิน ${maxHistoryDays} วัน` };
  const outcome = params.get('outcome') || 'all';
  if (outcome !== 'all' && outcome !== 'delivered' && outcome !== 'failed') return { error: 'สถานะไม่ถูกต้อง' };
  const page = Number(params.get('page') || '1');
  if (!Number.isInteger(page) || page < 1) return { error: 'หน้าไม่ถูกต้อง' };
  return { from, to, start, end, outcome, page };
}

// Newest first; counts cover the whole range so the rider sees totals for both outcomes whatever the filter.
export function pageOfHistory<T extends FinishedAttempt>(attempts: T[], outcome: HistoryFilter, page: number) {
  const inRange = [...attempts].sort((left, right) => finishedAt(right).getTime() - finishedAt(left).getTime());
  const counts = { delivered: 0, failed: 0 };
  for (const attempt of inRange) counts[outcomeOf(attempt)] += 1;
  const matching = outcome === 'all' ? inRange : inRange.filter((attempt) => outcomeOf(attempt) === outcome);
  const pages = Math.max(1, Math.ceil(matching.length / historyPageSize));
  return {
    items: matching.slice((page - 1) * historyPageSize, page * historyPageSize),
    total: matching.length,
    page,
    pages,
    counts,
  };
}
