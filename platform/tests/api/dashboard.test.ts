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
