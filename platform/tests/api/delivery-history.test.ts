import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findMany, count, currentSession } = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany, count } } }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const search = async (query: string) => (await import('@/app/api/reports/history/route')).GET(new NextRequest(`http://localhost/api/reports/history?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  as('coordinator');
  count.mockResolvedValue(26);
  findMany.mockResolvedValue([{
    id: 'ATTEMPT0ABC12', status: 'delivered', createdAt: new Date('2026-10-01T02:00:00Z'), claimedAt: null, deliveredAt: new Date('2026-10-01T04:40:00Z'), failedAt: null, failureReason: null,
    rider: { id: 'R1', displayName: 'ไรเดอร์หนึ่ง', avatarUpdatedAt: null, riderProfile: { riderCode: 'INT-001' } },
    deliveryRequest: { hn: '470032520', patientName: 'ผู้ป่วยหนึ่ง', deliveryZone: { subdistrictCode: '440801', subdistrictName: 'ตำบลเอ', displayName: 'หมู่ 1' } },
  }]);
});

test('only coordinators and admins search delivery history', async () => {
  for (const role of ['pharmacy', 'rider', 'auditor']) {
    as(role);
    expect((await search('')).status).toBe(403);
  }
});

test('combines HN, rider code or name, subdistrict and zone filters and pages the results', async () => {
  const response = await search('from=2026-10-01&to=2026-10-31&hn=4700&rider=INT-001&subdistrict=440801&zone=ZONE1&page=2');

  expect(response.status).toBe(200);
  const where = findMany.mock.calls[0][0].where;
  expect(where.deliveryRequest).toEqual({ hn: { contains: '4700' }, deliveryZoneId: 'ZONE1', deliveryZone: { subdistrictCode: '440801' } });
  expect(where.rider).toEqual({ OR: [{ displayName: { contains: 'INT-001' } }, { riderProfile: { riderCode: { contains: 'INT-001' } } }] });
  expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 25, take: 25 });
  await expect(response.json()).resolves.toMatchObject({
    page: 2, pages: 2, total: 26,
    items: [{ hn: '470032520', subdistrict: 'ตำบลเอ', zone: 'หมู่ 1', rider: { riderCode: 'INT-001' }, status: 'delivered' }],
  });
});

test('blank filters match everything in the date range, and a CSV can be downloaded', async () => {
  await search('from=2026-10-01&to=2026-10-31');
  const where = findMany.mock.calls[0][0].where;
  expect(where).not.toHaveProperty('rider');
  expect(where.deliveryRequest).toEqual({});

  const csv = await search('from=2026-10-01&to=2026-10-31&format=csv');
  expect(csv.headers.get('content-type')).toContain('text/csv');
  expect(await csv.text()).toContain('470032520');
});
