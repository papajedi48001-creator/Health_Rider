import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findMany, currentSession } = vi.hoisted(() => ({ findMany: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { riderProfile: { findMany } } }));

const list = async () => (await import('@/app/api/reports/history/riders/route')).GET(new NextRequest('http://localhost/api/reports/history/riders'));

beforeEach(() => {
  vi.clearAllMocks();
  findMany.mockResolvedValue([{ riderCode: 'INT-001', user: { id: 'R1', displayName: 'ไรเดอร์หนึ่ง' } }]);
});

test('coordinators and admins get every rider code and name to pick from', async () => {
  for (const role of ['coordinator', 'admin']) {
    currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
    await expect((await list()).json()).resolves.toEqual({ riders: [{ id: 'R1', displayName: 'ไรเดอร์หนึ่ง', riderCode: 'INT-001' }] });
  }
});

test('other roles cannot list riders', async () => {
  for (const role of ['pharmacy', 'rider', 'auditor']) {
    currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
    expect((await list()).status).toBe(403);
  }
});
