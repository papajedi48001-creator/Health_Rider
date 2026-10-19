import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, countUsers, findUser, createUser, updateUsers, findUserOrThrow, createRider, findRider, findRiders, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), countUsers: vi.fn(), findUser: vi.fn(), createUser: vi.fn(), updateUsers: vi.fn(), findUserOrThrow: vi.fn(), createRider: vi.fn(),
  findRider: vi.fn(), findRiders: vi.fn(), createAudit: vi.fn(),
}));
const tx = {
  user: { count: countUsers, findUnique: findUser, create: createUser, updateMany: updateUsers, findUniqueOrThrow: findUserOrThrow },
  riderProfile: { create: createRider, findUnique: findRider, findMany: findRiders },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { ...tx, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const application = { username: 'new.pharmacist', displayName: 'เภสัชใหม่', phone: '0812345678', healthCenter: 'รพ.สต.จำปาทอง', role: 'pharmacy', password: 'long-enough-password' };
const params = { params: Promise.resolve({ userId: 'user-9' }) };

beforeEach(() => {
  vi.clearAllMocks();
  countUsers.mockResolvedValue(0);
  findUser.mockResolvedValue(null);
  createUser.mockResolvedValue({ id: 'user-9' });
  updateUsers.mockResolvedValue({ count: 1 });
  findRider.mockResolvedValue(null);
  findRiders.mockResolvedValue([]);
  findUserOrThrow.mockResolvedValue({ id: 'user-9', username: 'new.pharmacist', role: 'pharmacy', active: true, pendingApproval: false });
});

test('creates an application that cannot sign in until approved, and audits it', async () => {
  const { POST } = await import('@/app/api/auth/register/route');

  const response = await POST(post('/api/auth/register', { ...application, role: 'pharmacy', active: true }));

  expect(response.status).toBe(201);
  expect(createUser).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ username: 'new.pharmacist', role: 'pharmacy', healthCenter: 'รพ.สต.จำปาทอง', active: false, pendingApproval: true }),
  }));
  expect(createUser.mock.calls[0][0].data.passwordHash).not.toBe(application.password);
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.registered' }) }));
});

test('refuses admin roles, taken usernames, cross-site posts and floods', async () => {
  const { POST } = await import('@/app/api/auth/register/route');

  expect((await POST(post('/api/auth/register', { ...application, role: 'admin' }))).status).toBe(422);
  findUser.mockResolvedValueOnce({ id: 'someone' });
  expect((await POST(post('/api/auth/register', application))).status).toBe(409);
  expect((await POST(post('/api/auth/register', application, { 'sec-fetch-site': 'cross-site' }))).status).toBe(403);
  countUsers.mockResolvedValueOnce(50);
  expect((await POST(post('/api/auth/register', application))).status).toBe(429);

  const from = { 'x-forwarded-for': '198.51.100.4' };
  for (let attempt = 0; attempt < 5; attempt += 1) await POST(post('/api/auth/register', { ...application, username: `flood${attempt}` }, from));
  expect((await POST(post('/api/auth/register', { ...application, username: 'flood9' }, from))).status).toBe(429);
});

test('only an admin approves, and a rider gets a profile with the approval', async () => {
  const { POST } = await import('@/app/api/admin/users/[userId]/approval/route');
  findUser.mockResolvedValue({ role: 'rider', pendingApproval: true });

  currentSession.mockResolvedValueOnce({ id: 'coord-1', role: 'coordinator', displayName: 'ผู้ประสานงาน' });
  expect((await POST(post('/x', { decision: 'approve', role: 'rider', healthCenter: 'รพ.สต.ปลาโหล', riderCode: 'R-1', employmentCategory: 'internal' }), params)).status).toBe(403);

  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'แอดมิน' });
  const response = await POST(post('/x', { decision: 'approve', role: 'rider', healthCenter: 'รพ.สต.ปลาโหล', riderCode: 'R-1', employmentCategory: 'internal' }), params);

  expect(response.status).toBe(200);
  expect(updateUsers).toHaveBeenCalledWith({ where: { id: 'user-9', pendingApproval: true }, data: { pendingApproval: false, active: true, role: 'rider', healthCenter: 'รพ.สต.ปลาโหล' } });
  expect(createRider).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: 'user-9', riderCode: 'INT-001', employmentCategory: 'internal' }) });
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'user.registration_approved' }) }));
});

test('approving a rider always gives the next code of that category, whatever code was sent', async () => {
  const { POST } = await import('@/app/api/admin/users/[userId]/approval/route');
  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'แอดมิน' });
  findUser.mockResolvedValue({ role: 'rider', pendingApproval: true });
  findRiders.mockResolvedValue([{ riderCode: 'EXT-001' }, { riderCode: 'EXT-009' }, { riderCode: 'EXT-old' }]);

  expect((await POST(post('/x', { decision: 'approve', role: 'rider', healthCenter: 'รพ.สต.ปลาโหล', riderCode: 'MY-OWN', employmentCategory: 'external' }), params)).status).toBe(200);
  expect(createRider).toHaveBeenCalledWith({ data: expect.objectContaining({ riderCode: 'EXT-010', employmentCategory: 'external' }) });
});

test('a decision already made by another admin is not applied twice', async () => {
  const { POST } = await import('@/app/api/admin/users/[userId]/approval/route');
  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'แอดมิน' });
  findUser.mockResolvedValue({ role: 'pharmacy', pendingApproval: false });
  updateUsers.mockResolvedValue({ count: 0 });

  expect((await POST(post('/x', { decision: 'reject' }), params)).status).toBe(409);
  expect(createAudit).not.toHaveBeenCalled();
});
