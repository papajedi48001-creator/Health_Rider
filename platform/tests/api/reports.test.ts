import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { attemptFindMany, requestFindMany, groupBy, currentSession } = vi.hoisted(() => ({
  attemptFindMany: vi.fn(), requestFindMany: vi.fn(), groupBy: vi.fn(), currentSession: vi.fn(),
}));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany: attemptFindMany, groupBy }, deliveryRequest: { findMany: requestFindMany } } }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const get = (path: string) => new NextRequest(`http://localhost${path}`);
const zone = { subdistrictCode: '440801', subdistrictName: 'ตำบลเอ', displayName: 'หมู่ 1' };
const rider = { id: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderProfile: { riderCode: 'R-01', employmentCategory: 'external' } };

beforeEach(() => {
  vi.clearAllMocks();
  requestFindMany.mockResolvedValue([{ createdAt: new Date('2026-10-01T03:00:00Z'), deliveryZone: zone }]);
  groupBy.mockResolvedValue([{ status: 'prepared', _count: { _all: 4 } }]);
  attemptFindMany.mockResolvedValue([
    { id: 'ATTEMPT0ABC12', claimedAt: new Date('2026-10-01T04:00:00Z'), pickedUpAt: new Date('2026-10-01T04:10:00Z'), deliveredAt: new Date('2026-10-01T04:40:00Z'), failedAt: null, returnedAt: null, failureReason: null, rider, deliveryRequest: { rateSatang: 3500, deliveryZone: zone } },
  ]);
});

test('each report is limited to the roles it serves', async () => {
  const pharmacy = (await import('@/app/api/reports/pharmacy/route')).GET;
  const delivery = (await import('@/app/api/reports/delivery/route')).GET;
  const fees = (await import('@/app/api/reports/fees/route')).GET;
  const allowed: Record<string, string[]> = { pharmacy: ['pharmacy', 'admin'], delivery: ['coordinator', 'admin'], fees: ['admin'] };
  const routes = { pharmacy, delivery, fees };
  for (const role of ['pharmacy', 'coordinator', 'admin', 'rider', 'auditor']) {
    as(role);
    for (const [name, route] of Object.entries(routes)) {
      const status = (await route(get(`/api/reports/${name}?from=2026-10-01&to=2026-10-02`))).status;
      expect([name, role, status]).toEqual([name, role, allowed[name].includes(role) ? 200 : 403]);
    }
  }
});

test('the pharmacy report counts confirmations, outcomes and open work', async () => {
  as('pharmacy');
  const { GET } = await import('@/app/api/reports/pharmacy/route');
  const body = await (await GET(get('/api/reports/pharmacy?from=2026-10-01&to=2026-10-01'))).json();
  expect(body.totals).toEqual({ confirmed: 1, delivered: 1, failed: 0, returned: 0, successRate: 100 });
  expect(body.backlog).toEqual({ prepared: 4, claimed: 0, in_transit: 0, return_required: 0, sync_review: 0 });
});

test('the fee report downloads as a CSV of baht amounts without patient details', async () => {
  as('admin');
  const { GET } = await import('@/app/api/reports/fees/route');
  const response = await GET(get('/api/reports/fees?from=2026-10-01&to=2026-10-31&format=csv'));
  expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="rider-fees-2026-10-01-2026-10-31.csv"');
  const csv = await response.text();
  expect(csv).toContain('R-01,ไรเดอร์หนึ่ง,ไรเดอร์ภายนอก,1,35.00,0');
  expect(csv).toContain('2026-10-01,R-01,ไรเดอร์หนึ่ง,0ABC12,440801,หมู่ 1,35.00');
});

test('a bad range is rejected before reading the database', async () => {
  as('admin');
  const { GET } = await import('@/app/api/reports/delivery/route');
  expect((await GET(get('/api/reports/delivery?from=2026-10-09&to=2026-10-01'))).status).toBe(422);
  expect(attemptFindMany).not.toHaveBeenCalled();
});
