import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findMany, currentSession } = vi.hoisted(() => ({ findMany: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany } } }));

const history = (query: string) => new NextRequest(`http://localhost/api/rider/history?${query}`);

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  findMany.mockResolvedValue([
    {
      id: 'A1', status: 'delivered', deliveredAt: new Date('2026-10-13T03:00:00Z'), failedAt: null, failureReason: null,
      deliveryRequest: { hn: 'HN1', patientName: 'ผู้ป่วยหนึ่ง', deliveryAddress: 'บ้านหนึ่ง' },
    },
    {
      id: 'A2', status: 'return_required', deliveredAt: null, failedAt: new Date('2026-10-13T05:00:00Z'), failureReason: 'address_not_found',
      deliveryRequest: { hn: 'HN2', patientName: 'ผู้ป่วยสอง', deliveryAddress: 'บ้านสอง' },
    },
  ]);
});

test('lists only the signed-in rider’s delivered and failed attempts in the Bangkok date range', async () => {
  const { GET } = await import('@/app/api/rider/history/route');
  const response = await GET(history('from=2026-10-13&to=2026-10-13'));

  expect(response.status).toBe(200);
  const range = { gte: new Date('2026-10-12T17:00:00.000Z'), lt: new Date('2026-10-13T17:00:00.000Z') };
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { riderId: 'rider-1', OR: [{ deliveredAt: range }, { failedAt: range }] },
  }));
  const body = await response.json();
  expect(body).toMatchObject({ page: 1, pages: 1, total: 2, counts: { delivered: 1, failed: 1 } });
  expect(body.items).toEqual([
    { id: 'A2', outcome: 'failed', status: 'return_required', finishedAt: '2026-10-13T05:00:00.000Z', failureReason: 'address_not_found', hn: 'HN2', patientName: 'ผู้ป่วยสอง', address: 'บ้านสอง' },
    { id: 'A1', outcome: 'delivered', status: 'delivered', finishedAt: '2026-10-13T03:00:00.000Z', failureReason: null, hn: 'HN1', patientName: 'ผู้ป่วยหนึ่ง', address: 'บ้านหนึ่ง' },
  ]);
});

test('rejects other roles and bad ranges', async () => {
  const { GET } = await import('@/app/api/rider/history/route');
  currentSession.mockResolvedValueOnce({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
  expect((await GET(history(''))).status).toBe(403);
  expect((await GET(history('from=2026-10-14&to=2026-10-01'))).status).toBe(422);
  expect(findMany).not.toHaveBeenCalled();
});
