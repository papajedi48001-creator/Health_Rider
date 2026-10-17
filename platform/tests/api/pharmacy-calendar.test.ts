import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { visitsBetween, findRequests, currentSession } = vi.hoisted(() => ({ visitsBetween: vi.fn(), findRequests: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ visitsBetween }) }));
vi.mock('@/lib/db', () => ({ db: { deliveryRequest: { findMany: findRequests } } }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const calendar = async (month: string) => (await import('@/app/api/pharmacy/candidates/calendar/route')).GET(new NextRequest(`http://localhost/api/pharmacy/candidates/calendar?month=${month}`));

beforeEach(() => {
  vi.clearAllMocks();
  as('pharmacy');
  visitsBetween.mockResolvedValue([
    { date: '2026-10-16', visitNumber: 'V1' }, { date: '2026-10-16', visitNumber: 'V2' }, { date: '2026-10-03', visitNumber: 'V3' },
  ]);
  findRequests.mockResolvedValue([{ hosVisitNumber: 'V3' }, { hosVisitNumber: 'V1' }]);
});

test('counts each day’s HOSxP visits and those still waiting for pharmacy, across the whole month', async () => {
  const response = await calendar('2026-02');

  expect(visitsBetween).toHaveBeenCalledWith('2026-02-01', '2026-02-28');
  await expect(response.json()).resolves.toEqual({ days: [
    { date: '2026-10-03', visits: 1, pending: 0 },
    { date: '2026-10-16', visits: 2, pending: 1 },
  ] });
});

test('refuses a bad month and roles outside pharmacy', async () => {
  expect((await calendar('2026-13')).status).toBe(422);
  expect(visitsBetween).not.toHaveBeenCalled();
  for (const role of ['coordinator', 'rider']) {
    as(role);
    expect((await calendar('2026-10')).status).toBe(403);
  }
});
