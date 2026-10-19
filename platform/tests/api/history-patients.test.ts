import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findMany, currentSession } = vi.hoisted(() => ({ findMany: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryRequest: { findMany } } }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const suggest = async (q: string) => (await import('@/app/api/reports/history/patients/route')).GET(new NextRequest(`http://localhost/api/reports/history/patients?q=${encodeURIComponent(q)}`));

beforeEach(() => {
  vi.clearAllMocks();
  as('pharmacy');
  findMany.mockResolvedValue([
    { hn: '470032520', patientName: 'ไพวรรณ ผิวบุญเรือง' },
    { hn: '470032520', patientName: 'ไพวรรณ เก่า' },
    { hn: '470099999', patientName: 'ไพบูลย์ ใจดี' },
  ]);
});

test('suggests each delivered-to patient once by HN or name', async () => {
  const body = await (await suggest('ไพ')).json();

  expect(findMany.mock.calls[0][0].where).toEqual({ attempts: { some: {} }, OR: [{ hn: { contains: 'ไพ' } }, { patientName: { contains: 'ไพ' } }] });
  expect(body.patients).toEqual([{ hn: '470032520', patientName: 'ไพวรรณ ผิวบุญเรือง' }, { hn: '470099999', patientName: 'ไพบูลย์ ใจดี' }]);
});

test('blank text reads nothing, and other roles are refused', async () => {
  expect(await (await suggest('  ')).json()).toEqual({ patients: [] });
  expect(findMany).not.toHaveBeenCalled();
  for (const role of ['rider', 'auditor']) {
    as(role);
    expect((await suggest('47')).status).toBe(403);
  }
});
