import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findUnique, update, revoke, createAudit, currentSession, countCenters } = vi.hoisted(() => ({
  findUnique: vi.fn(), update: vi.fn(), revoke: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(), countCenters: vi.fn().mockResolvedValue(1),
}));
const tx = { user: { findUnique, update }, session: { updateMany: revoke }, auditEvent: { create: createAudit } };
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { healthCenter: { count: countCenters }, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const edit = async (userId: string, json: Record<string, unknown>) => (await import('@/app/api/admin/users/[userId]/route')).PATCH(
  new NextRequest(`http://localhost/api/admin/users/${userId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(json) }),
  { params: Promise.resolve({ userId }) },
);

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'admin' });
  update.mockImplementation(async ({ data }) => ({ id: 'u1', username: 'u', displayName: 'x', phone: null, healthCenter: null, role: 'coordinator', active: true, ...data }));
});

test('an admin edits a staff account\'s name, phone and รพ.สต.', async () => {
  findUnique.mockResolvedValue({ displayName: 'เดิม', phone: null, healthCenter: null, role: 'coordinator', active: true, pendingApproval: false });
  const response = await edit('u1', { displayName: 'ชื่อใหม่', phone: '0812345678', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(response.status).toBe(200);
  expect(update.mock.calls[0][0].data).toEqual({ displayName: 'ชื่อใหม่', phone: '0812345678', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(revoke).not.toHaveBeenCalled();
});

test('a rider is given a รพ.สต. too, and it cannot be cleared', async () => {
  findUnique.mockResolvedValue({ displayName: 'ไรเดอร์', phone: null, healthCenter: null, role: 'rider', active: true, pendingApproval: false });
  await edit('u2', { displayName: 'ไรเดอร์', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(update.mock.calls[0][0].data).toMatchObject({ healthCenter: 'รพ.สต.ปลาโหล' });
  expect((await edit('u2', { healthCenter: '' })).status).toBe(422);
  expect(update).toHaveBeenCalledTimes(1);
});

test('a password set by an admin must be changed at the next sign-in', async () => {
  findUnique.mockResolvedValue({ displayName: 'ไรเดอร์', phone: null, healthCenter: 'รพ.สต.ปลาโหล', role: 'rider', active: true, pendingApproval: false });
  await edit('u2', { password: 'reset-by-admin-123' });
  expect(update.mock.calls[0][0].data).toMatchObject({ mustChangePassword: true });
  expect(revoke).toHaveBeenCalled();
});
