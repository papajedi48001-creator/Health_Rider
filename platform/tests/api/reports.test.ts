import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { attemptFindMany, requestFindMany, rateFindMany, groupBy, currentSession } = vi.hoisted(() => ({
  attemptFindMany: vi.fn(), requestFindMany: vi.fn(), rateFindMany: vi.fn(), groupBy: vi.fn(), currentSession: vi.fn(),
}));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany: attemptFindMany, groupBy }, deliveryRequest: { findMany: requestFindMany }, serviceRate: { findMany: rateFindMany } } }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const get = (path: string) => new NextRequest(`http://localhost${path}`);
const zone = { id: 'Z1', subdistrictCode: '440801', subdistrictName: 'ตำบลเอ', displayName: 'หมู่ 1' };
const rider = { id: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderProfile: { riderCode: 'R-01', employmentCategory: 'external' } };

beforeEach(() => {
  vi.clearAllMocks();
  requestFindMany.mockResolvedValue([{ createdAt: new Date('2026-10-01T03:00:00Z'), deliveryZone: zone }]);
  rateFindMany.mockResolvedValue([]);
  groupBy.mockResolvedValue([{ status: 'prepared', _count: { _all: 4 } }]);
  attemptFindMany.mockResolvedValue([
    { id: 'ATTEMPT0ABC12', claimedAt: new Date('2026-10-01T04:00:00Z'), pickedUpAt: new Date('2026-10-01T04:10:00Z'), deliveredAt: new Date('2026-10-01T04:40:00Z'), failedAt: null, returnedAt: null, failureReason: null, rider, deliveryRequest: { createdAt: new Date('2026-10-01T02:00:00Z'), rateSatang: 3500, deliveryZone: zone } },
  ]);
});

test('each report is limited to the roles it serves', async () => {
  const pharmacy = (await import('@/app/api/reports/pharmacy/route')).GET;
  const delivery = (await import('@/app/api/reports/delivery/route')).GET;
  const fees = (await import('@/app/api/reports/fees/route')).GET;
  const allowed: Record<string, string[]> = { pharmacy: ['pharmacy', 'admin'], delivery: ['pharmacy', 'coordinator', 'admin'], fees: ['admin'] };
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

test('a delivered job with no price yet takes its subdistrict rate', async () => {
  as('admin');
  attemptFindMany.mockResolvedValueOnce([
    { id: 'ATTEMPT0XYZ99', deliveredAt: new Date('2026-10-14T04:40:00Z'), rider, deliveryRequest: { createdAt: new Date('2026-10-14T02:00:00Z'), rateSatang: null, deliveryZone: zone } },
  ]);
  rateFindMany.mockResolvedValueOnce([{ subdistrictCode: '440801', deliveryZoneId: null, rateSatang: 4000, effectiveFrom: new Date('2026-10-15T00:00:00Z'), createdAt: new Date() }]);
  const { GET } = await import('@/app/api/reports/fees/route');
  const body = await (await GET(get('/api/reports/fees?from=2026-10-01&to=2026-10-31'))).json();
  expect(body.totals).toEqual({ deliveries: 1, totalSatang: 4000, unpriced: 0, backfilled: 1 });
});

test('a coordinator opens one rider’s jobs in the range, latest first, twenty per page', async () => {
  currentSession.mockResolvedValue({ id: 'coordinator-1', role: 'coordinator', displayName: 'C', healthCenter: 'รพ.สต.ปลาโหล' });
  const { db } = await import('@/lib/db');
  (db as unknown as { user: { findUnique: ReturnType<typeof vi.fn> } }).user = { findUnique: vi.fn().mockResolvedValue({ id: 'R1', displayName: 'ไรเดอร์หนึ่ง', healthCenter: 'รพ.สต.ปลาโหล', riderProfile: { riderCode: 'R-01' } }) };
  const job = (id: string, deliveredAt: string | null, failedAt: string | null) => ({
    id, status: deliveredAt ? 'delivered' : 'return_required', claimedAt: new Date('2026-10-01T01:00:00Z'), pickedUpAt: new Date('2026-10-01T01:10:00Z'),
    deliveredAt: deliveredAt && new Date(deliveredAt), failedAt: failedAt && new Date(failedAt), failureReason: failedAt ? 'recipient_unavailable' : null,
    evidence: deliveredAt ? { id: 'E' } : null, deliveryRequest: { hn: 'HN', patientName: 'ผู้ป่วย', deliveryZone: { displayName: 'หมู่ 1' } },
  });
  attemptFindMany.mockResolvedValueOnce([job('ATTEMPT0000A1', '2026-10-01T01:40:00Z', null), job('ATTEMPT0000B2', null, '2026-10-02T03:00:00Z')]);
  const { GET } = await import('@/app/api/reports/delivery/rider/route');
  const body = await (await GET(get('/api/reports/delivery/rider?riderId=R1&from=2026-10-01&to=2026-10-02'))).json();

  expect(attemptFindMany.mock.calls.at(-1)![0].where.AND).toEqual([expect.objectContaining({ riderId: 'R1' }), { rider: { healthCenter: 'รพ.สต.ปลาโหล' } }]);
  expect(body).toMatchObject({ rider: { id: 'R1', riderCode: 'R-01' }, page: 1, pages: 1, total: 2 });
  expect(body.items.map((item: { packageCode: string }) => item.packageCode)).toEqual(['0000B2', '0000A1']);
  expect(body.items[1]).toMatchObject({ minutes: 30, hasEvidence: true });

  // A rider from another รพ.สต. is not found for this coordinator.
  currentSession.mockResolvedValue({ id: 'coordinator-2', role: 'coordinator', displayName: 'C', healthCenter: 'รพ.สต.คำบิด' });
  expect((await GET(get('/api/reports/delivery/rider?riderId=R1'))).status).toBe(404);
  as('rider');
  expect((await GET(get('/api/reports/delivery/rider?riderId=R1'))).status).toBe(403);
});
