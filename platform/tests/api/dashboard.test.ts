import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findMany, currentSession } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany }, deliveryZone: { findMany: vi.fn().mockResolvedValue([]) } } }));

test('dashboard applies an allowed status filter for coordinator on a Thai day', async () => {
  const { GET } = await import('@/app/api/operations/dashboard/route');
  currentSession.mockResolvedValue({ id: 'c1', role: 'coordinator', displayName: 'C' });

  const response = await GET(new NextRequest('http://localhost/api/operations/dashboard?status=delivered&date=2026-10-14'));

  expect(response.status).toBe(200);
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ status: 'delivered', createdAt: { gte: new Date('2026-10-13T17:00:00.000Z'), lt: new Date('2026-10-14T17:00:00.000Z') } }),
  }));
});

test('dashboard answers an unknown status with 422 instead of a server error', async () => {
  const { GET } = await import('@/app/api/operations/dashboard/route');
  currentSession.mockResolvedValue({ id: 'c1', role: 'coordinator', displayName: 'C' });

  expect((await GET(new NextRequest('http://localhost/api/operations/dashboard?status=lost'))).status).toBe(422);
});

test('dashboard can include jobs still open from earlier days, so it matches the menu count', async () => {
  const { GET } = await import('@/app/api/operations/dashboard/route');
  currentSession.mockResolvedValue({ id: 'c1', role: 'coordinator', displayName: 'C' });

  await GET(new NextRequest('http://localhost/api/operations/dashboard?date=2026-10-14&includeOpen=1'));

  expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({
    where: {
      OR: [
        { createdAt: { gte: new Date('2026-10-13T17:00:00.000Z'), lt: new Date('2026-10-14T17:00:00.000Z') } },
        { status: { in: ['prepared', 'claimed', 'in_transit', 'sync_review', 'return_required'] } },
      ],
    },
  }));
});

test('dashboard downloads the filtered list as CSV', async () => {
  const { GET } = await import('@/app/api/operations/dashboard/route');
  currentSession.mockResolvedValue({ id: 'c1', role: 'coordinator', displayName: 'C' });
  findMany.mockResolvedValueOnce([{
    id: 'ATTEMPT1ABC', status: 'delivered', createdAt: new Date('2026-10-14T03:00:00Z'), claimedAt: null, pickedUpAt: null,
    deliveredAt: new Date('2026-10-14T05:00:00Z'), failedAt: null, failureReason: null,
    rider: { id: 'r1', displayName: 'ไรเดอร์ เอ', avatarUpdatedAt: null, riderProfile: { riderCode: 'R-01' } },
    deliveryRequest: { id: 'q1', hn: '470000001', patientName: 'ผู้ป่วย ทดสอบ', telephone: null, deliveryAddress: '1 หมู่ 9', deliveryVersion: 1, deliveryZone: { displayName: 'หมู่ 9 บ้านดงเชียงเครือ' } },
  }]);

  const response = await GET(new NextRequest('http://localhost/api/operations/dashboard?date=2026-10-14&status=delivered&format=csv'));

  expect(response.headers.get('content-type')).toContain('text/csv');
  expect(response.headers.get('content-disposition')).toContain('delivery-overview-2026-10-14-2026-10-14.csv');
  const body = await response.text();
  expect(body).toContain('470000001');
  expect(body).toContain('หมู่ 9 บ้านดงเชียงเครือ');
  expect(body).toContain('R-01');
});
