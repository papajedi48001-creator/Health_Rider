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

function login(body: unknown) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body),
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
