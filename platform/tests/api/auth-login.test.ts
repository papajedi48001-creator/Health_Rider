import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPassword } from '@/auth/session';

const { findUser, createSession, createAudit } = vi.hoisted(() => ({ findUser: vi.fn(), createSession: vi.fn(), createAudit: vi.fn() }));
const tx = { session: { create: createSession }, auditEvent: { create: createAudit } };

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: findUser },
    session: { create: createSession, findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

function login(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-session-secret-that-is-long-enough';
  findUser.mockReset();
  createSession.mockReset();
  createAudit.mockReset();
});

test('signs in an active user with an HttpOnly session cookie and audits it', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  findUser.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', active: true, passwordHash: await hashPassword('correct-password') });

  const response = await POST(login({ username: 'pharmacy.uat', password: 'correct-password' }));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ redirectTo: '/pharmacy/candidates' });
  expect(response.headers.get('set-cookie')).toMatch(/health_rider_session=.+HttpOnly/i);
  expect(createSession).toHaveBeenCalledTimes(1);
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.logged_in' }) }));
});

test('rejects a wrong password or a deactivated account without creating a session', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  const passwordHash = await hashPassword('correct-password');

  findUser.mockResolvedValue({ id: 'rider-1', role: 'rider', active: true, passwordHash });
  expect((await POST(login({ username: 'rider.a', password: 'wrong-password' }))).status).toBe(401);

  findUser.mockResolvedValue({ id: 'rider-1', role: 'rider', active: false, passwordHash });
  expect((await POST(login({ username: 'rider.b', password: 'correct-password' }))).status).toBe(401);

  expect(createSession).not.toHaveBeenCalled();
});

test('answers malformed input with 422 instead of a server error', async () => {
  const { POST } = await import('@/app/api/auth/login/route');

  expect((await POST(login('{not json'))).status).toBe(422);
  expect((await POST(login({ username: 'x' }))).status).toBe(422);
});

test('a plain form post signs in with a redirect and never needs credentials in a URL', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  findUser.mockResolvedValue({ id: 'rider-1', role: 'rider', active: true, passwordHash: await hashPassword('correct-password') });
  const form = (password: string) => new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: 'rider.c', password, next: '/rider/attempts/a1' }).toString(),
  });

  const success = await POST(form('correct-password'));
  expect(success.status).toBe(303);
  expect(success.headers.get('location')).toBe('/rider/attempts/a1');

  const failure = await POST(form('wrong-password'));
  expect(failure.headers.get('location')).toBe('/login?error=401&next=%2Frider%2Fattempts%2Fa1');
});

test('looks usernames up in lower case so changing letter case does not get extra guesses', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  findUser.mockResolvedValue(null);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const username = attempt % 2 === 0 ? 'Case.Test' : 'CASE.TEST';
    expect((await POST(login({ username, password: 'wrong-password-123' }))).status).toBe(401);
  }

  expect(findUser).toHaveBeenCalledWith(expect.objectContaining({ where: { username: 'case.test' } }));
  expect((await POST(login({ username: 'case.test', password: 'wrong-password-123' }))).status).toBe(429);
}, 30_000);

test('limits failures from one client address across usernames', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  findUser.mockResolvedValue(null);
  const from = { 'x-forwarded-for': '192.0.2.77' };

  for (let attempt = 0; attempt < 50; attempt += 1) await POST(login({ username: `spray${attempt}`, password: 'wrong-password-123' }, from));

  expect((await POST(login({ username: 'fresh.user', password: 'wrong-password-123' }, from))).status).toBe(429);
  expect((await POST(login({ username: 'fresh.user', password: 'wrong-password-123' }, { 'x-forwarded-for': '192.0.2.78' }))).status).toBe(401);
}, 60_000);

test('refuses a sign-in posted from another website', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  expect((await POST(login({ username: 'x.user', password: 'whatever-password' }, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
  expect(findUser).not.toHaveBeenCalled();
});

test('tells someone with the right password that their application is still waiting', async () => {
  const { POST } = await import('@/app/api/auth/login/route');
  const passwordHash = await hashPassword('correct-password');

  findUser.mockResolvedValue({ id: 'new-1', role: 'rider', active: false, pendingApproval: true, passwordHash });
  const waiting = await POST(login({ username: 'new.rider', password: 'correct-password' }));
  expect(waiting.status).toBe(403);
  await expect(waiting.json()).resolves.toEqual({ message: expect.stringContaining('รอผู้ดูแลระบบอนุมัติ') });

  expect((await POST(login({ username: 'new.rider2', password: 'wrong-password' }))).status).toBe(401);
  expect(createSession).not.toHaveBeenCalled();
});
