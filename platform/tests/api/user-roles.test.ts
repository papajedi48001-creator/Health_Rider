import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { hashSessionToken } from '@/auth/session';

const { currentSession, setActiveRole, findSession, findUser, updateUser, findGrants, deleteGrants, createGrants, findRequest, findRequests, updateRequests, createRequest, createRider, findRiders, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), setActiveRole: vi.fn(), findSession: vi.fn(), findUser: vi.fn(), updateUser: vi.fn(), findGrants: vi.fn(), deleteGrants: vi.fn(),
  createGrants: vi.fn(), findRequest: vi.fn(), findRequests: vi.fn(), updateRequests: vi.fn(), createRequest: vi.fn(), createRider: vi.fn(), findRiders: vi.fn(), createAudit: vi.fn(),
}));
const tx = {
  user: { findUnique: findUser, update: updateUser },
  userRoleGrant: { findMany: findGrants, deleteMany: deleteGrants, createMany: createGrants },
  roleRequest: { findUnique: findRequest, findMany: findRequests, updateMany: updateRequests, create: createRequest },
  riderProfile: { create: createRider, findMany: findRiders },
  session: { findUniqueOrThrow: findSession },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', async (original) => ({
  ...(await original<typeof import('@/auth/current-session')>()),
  getSessionFromRequest: currentSession,
  sessionStore: { setActiveRole },
}));
vi.mock('@/lib/db', () => ({ db: { ...tx, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const secret = 'test-session-secret-that-is-long-enough';
const send = (path: string, body: unknown, method = 'POST', cookie = '') => new NextRequest(`http://localhost${path}`, {
  method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});
const admin = { id: 'admin-1', role: 'admin', displayName: 'แอดมิน' };
const staff = { id: 'staff-1', role: 'pharmacy', roles: ['pharmacy', 'coordinator'], roleChoicePending: true, displayName: 'เจ้าหน้าที่' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_SECRET', secret);
  findRiders.mockResolvedValue([]);
  updateRequests.mockResolvedValue({ count: 1 });
  findSession.mockResolvedValue({ expiresAt: new Date(Date.now() + 60 * 60 * 1000) });
});

test('picks a held role for this sign-in, audits it and refuses a role the account does not hold', async () => {
  const { POST } = await import('@/app/api/me/role/route');
  currentSession.mockResolvedValue(staff);

  expect((await POST(send('/api/me/role', { role: 'admin' }, 'POST', 'health_rider_session=tok'))).status).toBe(403);
  expect(setActiveRole).not.toHaveBeenCalled();

  const response = await POST(send('/api/me/role', { role: 'coordinator' }, 'POST', 'health_rider_session=tok'));
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ role: 'coordinator', home: '/operations' });
  expect(setActiveRole).toHaveBeenCalledWith(hashSessionToken('tok', secret), 'coordinator');
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.role_selected', newValues: { role: 'coordinator' } }) }));
});

test('a user asks for another role from their profile, once', async () => {
  const { POST } = await import('@/app/api/me/role-requests/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  findGrants.mockResolvedValue([{ role: 'rider' }]);
  findRequests.mockResolvedValue([]);
  createRequest.mockImplementation(async ({ data }) => ({ ...data, status: 'pending' }));

  const response = await POST(send('/api/me/role-requests', { role: 'pharmacy', reason: 'ช่วยห้องยา' }));
  expect(response.status).toBe(201);
  expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'rider-1', role: 'pharmacy', reason: 'ช่วยห้องยา' }) }));
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.role_requested' }) }));

  findRequests.mockResolvedValue([{ role: 'pharmacy' }]);
  expect((await POST(send('/api/me/role-requests', { role: 'pharmacy' }))).status).toBe(409);
  expect((await POST(send('/api/me/role-requests', { role: 'rider' }))).status).toBe(422);
});

test('only an admin decides; approving a rider role adds it with a new rider code', async () => {
  const { POST } = await import('@/app/api/admin/role-requests/[requestId]/route');
  const params = { params: Promise.resolve({ requestId: 'req-1' }) };
  findRequest.mockResolvedValue({ userId: 'staff-1', role: 'rider' });
  findGrants.mockResolvedValue([{ role: 'pharmacy' }]);
  findUser.mockResolvedValue({ role: 'pharmacy', roleGrants: [{ role: 'pharmacy' }], riderProfile: null });

  currentSession.mockResolvedValueOnce({ id: 'staff-2', role: 'pharmacy', displayName: 'x' });
  expect((await POST(send('/x', { decision: 'approve', employmentCategory: 'internal' }), params)).status).toBe(403);

  currentSession.mockResolvedValue(admin);
  expect((await POST(send('/x', { decision: 'approve' }), params)).status).toBe(422);

  vi.clearAllMocks();
  findRiders.mockResolvedValue([]);
  updateRequests.mockResolvedValue({ count: 1 });
  const response = await POST(send('/x', { decision: 'approve', employmentCategory: 'internal' }), params);
  expect(response.status).toBe(200);
  expect(updateRequests).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'req-1', status: 'pending' }, data: expect.objectContaining({ status: 'approved', decidedById: 'admin-1' }) }));
  expect(createRider).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'staff-1', riderCode: 'INT-001' }) });
  expect(createGrants).toHaveBeenCalledWith({ data: [{ userId: 'staff-1', role: 'rider' }], skipDuplicates: true });
  expect(deleteGrants).not.toHaveBeenCalled();
});

test('a request another admin already decided is not applied twice, and a rejection changes no roles', async () => {
  const { POST } = await import('@/app/api/admin/role-requests/[requestId]/route');
  const params = { params: Promise.resolve({ requestId: 'req-1' }) };
  currentSession.mockResolvedValue(admin);
  findRequest.mockResolvedValue({ userId: 'staff-1', role: 'coordinator' });

  updateRequests.mockResolvedValueOnce({ count: 0 });
  expect((await POST(send('/x', { decision: 'approve' }), params)).status).toBe(409);
  expect(createGrants).not.toHaveBeenCalled();

  expect((await POST(send('/x', { decision: 'reject' }), params)).status).toBe(200);
  expect(createGrants).not.toHaveBeenCalled();
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.role_request_rejected' }) }));
});

test('an admin sets the roles directly; the role shown first moves when it is taken away', async () => {
  const { PUT } = await import('@/app/api/admin/users/[userId]/roles/route');
  const params = { params: Promise.resolve({ userId: 'staff-1' }) };
  currentSession.mockResolvedValue(admin);
  findUser.mockResolvedValue({ role: 'pharmacy', roleGrants: [{ role: 'pharmacy' }, { role: 'auditor' }], riderProfile: null });

  const response = await PUT(send('/x', { roles: ['coordinator', 'auditor'] }, 'PUT'), params);
  expect(response.status).toBe(200);
  expect(deleteGrants).toHaveBeenCalledWith({ where: { userId: 'staff-1', role: { in: ['pharmacy'] } } });
  expect(createGrants).toHaveBeenCalledWith({ data: [{ userId: 'staff-1', role: 'coordinator' }], skipDuplicates: true });
  expect(updateUser).toHaveBeenCalledWith({ where: { id: 'staff-1' }, data: { role: 'coordinator' } });
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ action: 'user.roles_changed', oldValues: { roles: ['pharmacy', 'auditor'] }, newValues: { roles: ['coordinator', 'auditor'] } }),
  }));

  expect((await PUT(send('/x', { roles: ['rider'] }, 'PUT'), params)).status).toBe(422);
  expect((await PUT(send('/x', { roles: ['pharmacy'] }, 'PUT'), { params: Promise.resolve({ userId: 'admin-1' }) })).status).toBe(422);
});
