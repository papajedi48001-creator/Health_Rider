import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession } = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));

const as = (role: string) => currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
const switchTo = async (view: unknown) => (await import('@/app/api/me/view/route')).POST(new NextRequest('http://localhost/api/me/view', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ view }),
}));

beforeEach(() => vi.clearAllMocks());

test('an admin switches the menu view and is sent to that role\'s first page', async () => {
  as('admin');
  const response = await switchTo('pharmacy');
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ view: 'pharmacy', home: '/pharmacy/candidates' });
  expect(response.headers.get('set-cookie')).toContain('hr_view=pharmacy');
});

test('only admins can switch, and only to a known view', async () => {
  for (const role of ['pharmacy', 'coordinator', 'rider', 'auditor']) {
    as(role);
    expect((await switchTo('admin')).status).toBe(403);
  }
  as('admin');
  expect((await switchTo('auditor')).status).toBe(422);
});
