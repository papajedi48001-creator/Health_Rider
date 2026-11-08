import { expect, test } from 'vitest';
import { RoleChoiceRequiredError, UnauthorizedError, requireRole } from '@/auth/require-role';
import { chooseSessionRole, endSession, heldRoles, resolveSession, staffIdleTimeoutMs, startSession, verifyLoginPassword, workingRole, type SessionStore, type StoredSession } from '@/auth/session';

const secret = 'test-session-secret-that-is-long-enough';
const now = new Date('2026-10-14T03:00:00.000Z');

function memoryStore(user: StoredSession['user']) {
  const sessions = new Map<string, StoredSession>();
  const store: SessionStore = {
    create: async (record) => { sessions.set(record.tokenHash, { expiresAt: record.expiresAt, lastSeenAt: record.lastSeenAt, revokedAt: null, user }); },
    findByTokenHash: async (tokenHash) => sessions.get(tokenHash) ?? null,
    revoke: async (tokenHash, revokedAt) => { const session = sessions.get(tokenHash); if (session) session.revokedAt = revokedAt; },
    touch: async (tokenHash, lastSeenAt) => { const session = sessions.get(tokenHash); if (session) session.lastSeenAt = lastSeenAt; },
  };
  return { sessions, store };
}

const rider = { id: 'rider-1', role: 'rider' as const, displayName: 'ไรเดอร์', active: true };
const pharmacist = { id: 'pharmacy-1', role: 'pharmacy' as const, displayName: 'เภสัชกร', active: true };
const minutes = (count: number) => new Date(now.getTime() + count * 60 * 1000);

test('stores only a hash of the session token and resolves the user from the store', async () => {
  const { sessions, store } = memoryStore(rider);
  const { token } = await startSession(rider.id, now, secret, store);

  expect([...sessions.keys()]).not.toContain(token);
  await expect(resolveSession(token, now, secret, store)).resolves.toEqual({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
});

test('rejects an expired, revoked, unknown or deactivated session', async () => {
  const { store } = memoryStore(rider);
  const { token, expiresAt } = await startSession(rider.id, now, secret, store);

  await expect(resolveSession(token, expiresAt, secret, store)).resolves.toBeNull();
  await expect(resolveSession('unknown-token', now, secret, store)).resolves.toBeNull();
  await endSession(token, now, secret, store);
  await expect(resolveSession(token, now, secret, store)).resolves.toBeNull();

  const inactive = memoryStore({ ...rider, active: false });
  const started = await startSession(rider.id, now, secret, inactive.store);
  await expect(resolveSession(started.token, now, secret, inactive.store)).resolves.toBeNull();
});

test('never accepts a password for an unknown user', async () => {
  await expect(verifyLoginPassword('any-password', null)).resolves.toBe(false);
});

test('ends a staff session after 30 minutes without activity, and keeps it alive while it is used', async () => {
  const { store } = memoryStore(pharmacist);
  const { token } = await startSession(pharmacist.id, now, secret, store);

  await expect(resolveSession(token, minutes(20), secret, store)).resolves.toMatchObject({ role: 'pharmacy' });
  await expect(resolveSession(token, minutes(45), secret, store)).resolves.toMatchObject({ role: 'pharmacy' });
  await expect(resolveSession(token, new Date(minutes(45).getTime() + staffIdleTimeoutMs), secret, store)).resolves.toBeNull();
  await expect(resolveSession(token, minutes(80), secret, store)).resolves.toBeNull();
});

test('keeps a rider session through a long offline job until the shift lifetime ends', async () => {
  const { store } = memoryStore(rider);
  const { token, expiresAt } = await startSession(rider.id, now, secret, store);

  await expect(resolveSession(token, minutes(5 * 60), secret, store)).resolves.toMatchObject({ role: 'rider' });
  await expect(resolveSession(token, expiresAt, secret, store)).resolves.toBeNull();
});

test('carries a pending forced password change with the session', async () => {
  const { store } = memoryStore({ ...rider, mustChangePassword: true });
  const { token } = await startSession(rider.id, now, secret, store);
  await expect(resolveSession(token, now, secret, store)).resolves.toMatchObject({ id: 'rider-1', mustChangePassword: true });
});

test('an account with several roles must pick one, then works in the role it picked', async () => {
  const user = { id: 'staff-1', role: 'pharmacy' as const, displayName: 'เจ้าหน้าที่', active: true, healthCenter: 'รพ.สต.ปลาโหล', roleGrants: [{ role: 'coordinator' as const }, { role: 'pharmacy' as const }] };
  const { sessions, store } = memoryStore(user);
  store.setActiveRole = async (tokenHash, role) => { const session = sessions.get(tokenHash); if (session) session.activeRole = role; };
  const { token } = await startSession(user.id, now, secret, store);

  const pending = await resolveSession(token, now, secret, store);
  expect(pending).toMatchObject({ roles: ['pharmacy', 'coordinator'], roleChoicePending: true });
  expect(() => requireRole(pending, 'pharmacy', 'coordinator')).toThrow(RoleChoiceRequiredError);

  await chooseSessionRole(token, 'coordinator', secret, store);
  const chosen = await resolveSession(token, now, secret, store);
  expect(chosen).toEqual({ id: 'staff-1', role: 'coordinator', roles: ['pharmacy', 'coordinator'], displayName: 'เจ้าหน้าที่', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(requireRole(chosen, 'coordinator').role).toBe('coordinator');
  expect(() => requireRole(chosen, 'pharmacy')).toThrow(UnauthorizedError);
});

test('a session whose picked role was taken away falls back to the only role left, or asks again', async () => {
  expect(workingRole('rider', ['pharmacy'])).toBe('pharmacy');
  expect(workingRole('rider', ['pharmacy', 'coordinator'])).toBeNull();
  expect(workingRole(null, ['admin'])).toBe('admin');
  expect(heldRoles({ role: 'rider' })).toEqual(['rider']);
  expect(heldRoles({ role: 'rider', roleGrants: [{ role: 'admin' }, { role: 'rider' }] })).toEqual(['rider', 'admin']);

  const { store } = memoryStore({ ...rider, roleGrants: [] });
  const { token } = await startSession(rider.id, now, secret, store);
  await expect(resolveSession(token, now, secret, store)).resolves.toBeNull();
});
