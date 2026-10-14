import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, findRequests, countAttempts, countConflicts, countConfirmed, eligibleFor } = vi.hoisted(() => ({
  currentSession: vi.fn(), findRequests: vi.fn(), countAttempts: vi.fn(), countConflicts: vi.fn(), countConfirmed: vi.fn(), eligibleFor: vi.fn(),
}));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ eligibleFor }) }));
vi.mock('@/lib/db', () => ({
  db: {
    deliveryRequest: { findMany: findRequests, count: countConfirmed },
    deliveryAttempt: { count: countAttempts },
    syncConflict: { count: countConflicts },
  },
}));

const request = () => new NextRequest('http://localhost/api/nav-counts');
const latest = (status: string | null) => ({ attempts: status ? [{ status }] : [] });

beforeEach(() => {
  vi.clearAllMocks();
  findRequests.mockResolvedValue([latest(null), latest('returned'), latest('prepared'), latest('return_required'), latest('delivered')]);
  eligibleFor.mockResolvedValue([{ visitNumber: 'V1' }, { visitNumber: 'V2' }, { visitNumber: 'V3' }]);
  countConfirmed.mockResolvedValue(1);
});

test('counts pharmacy queues and HOSxP visits still to confirm', async () => {
  const { GET } = await import('@/app/api/nav-counts/route');
  currentSession.mockResolvedValue({ id: 'p1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const body = await (await GET(request())).json();

  expect(body.counts).toEqual({
    '/pharmacy/candidates': 2, '/pharmacy/packages': 2, '/pharmacy/awaiting-rider': 1, '/pharmacy/returns': 1,
  });
  expect(countAttempts).not.toHaveBeenCalled();
});

test('counts a rider’s own open jobs only', async () => {
  const { GET } = await import('@/app/api/nav-counts/route');
  currentSession.mockResolvedValue({ id: 'r1', role: 'rider', displayName: 'ไรเดอร์' });
  countAttempts.mockResolvedValue(3);

  const body = await (await GET(request())).json();

  expect(body.counts).toEqual({ '/rider/scan': 3 });
  expect(countAttempts).toHaveBeenCalledWith({ where: expect.objectContaining({ riderId: 'r1' }) });
  expect(findRequests).not.toHaveBeenCalled();
});
