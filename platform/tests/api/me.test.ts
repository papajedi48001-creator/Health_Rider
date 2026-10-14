import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashPassword, hashSessionToken } from '@/auth/session';

const { currentSession, findUser, updateUser, updateSessions, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), updateSessions: vi.fn(), createAudit: vi.fn(),
}));
const tx = { user: { findUniqueOrThrow: findUser, update: updateUser }, session: { updateMany: updateSessions }, auditEvent: { create: createAudit } };
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { ...tx, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const secret = 'test-secret-for-me-routes-0123456789';
const json = (path: string, method: string, body: unknown) => new NextRequest(`http://localhost${path}`, {
  method, headers: { 'content-type': 'application/json', cookie: 'health_rider_session=current-token' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_SECRET', secret);
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
});

test('updates only the signed-in user’s name and phone and audits old and new values', async () => {
  const { PATCH } = await import('@/app/api/me/route');
  findUser.mockResolvedValue({ displayName: 'ไรเดอร์', phone: null });
  updateUser.mockResolvedValue({ username: 'rider.one', displayName: 'ไรเดอร์', phone: '0812345678', role: 'rider', riderProfile: null });

  const response = await PATCH(json('/api/me', 'PATCH', { phone: '081-234-5678', role: 'admin' }));

  expect(response.status).toBe(200);
  expect(updateUser).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'rider-1' }, data: { phone: '0812345678' } }));
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
    actorId: 'rider-1', action: 'user.profile_updated', auditableId: 'rider-1', oldValues: { phone: null }, newValues: { phone: '0812345678' },
  }) });
});

test('changes the password only with the current one and keeps this device signed in', async () => {
  const { POST } = await import('@/app/api/me/password/route');
  findUser.mockResolvedValue({ passwordHash: await hashPassword('current-password-1') });

  expect((await POST(json('/api/me/password', 'POST', { currentPassword: 'wrong-password-1', newPassword: 'brand-new-password' }))).status).toBe(422);
  expect(updateUser).not.toHaveBeenCalled();

  const response = await POST(json('/api/me/password', 'POST', { currentPassword: 'current-password-1', newPassword: 'brand-new-password' }));
  expect(response.status).toBe(200);
  expect(updateUser).toHaveBeenCalledWith({ where: { id: 'rider-1' }, data: { passwordHash: expect.any(String) } });
  expect(updateSessions).toHaveBeenCalledWith({
    where: { userId: 'rider-1', revokedAt: null, tokenHash: { not: hashSessionToken('current-token', secret) } }, data: { revokedAt: expect.any(Date) },
  });
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'user.password_changed', newValues: { passwordChanged: true } }) });
}, 20000);
