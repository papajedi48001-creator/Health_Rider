import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, findCenter, updateCenter, deleteCenter, createCenter, countUsers, moveUsers, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), findCenter: vi.fn(), updateCenter: vi.fn(), deleteCenter: vi.fn(), createCenter: vi.fn(),
  countUsers: vi.fn(), moveUsers: vi.fn(), createAudit: vi.fn(),
}));
const tx = {
  healthCenter: { findUnique: findCenter, update: updateCenter, delete: deleteCenter, create: createCenter },
  user: { count: countUsers, updateMany: moveUsers },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { ...tx, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const send = (method: string, body?: unknown) => new NextRequest('http://localhost/api/admin/health-centers/HC1', {
  method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const params = { params: Promise.resolve({ healthCenterId: 'HC1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'admin' });
  findCenter.mockResolvedValue({ name: 'รพ.สต.ปลาโหล', hospcode: null });
  updateCenter.mockImplementation(async ({ data }) => ({ id: 'HC1', ...data }));
});

test('adds a รพ.สต. with a hospcode that other units may share', async () => {
  const { POST } = await import('@/app/api/admin/health-centers/route');
  createCenter.mockImplementation(async ({ data }) => ({ id: data.id, name: data.name, hospcode: data.hospcode }));

  const response = await POST(new NextRequest('http://localhost/api/admin/health-centers', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: ' รพ.สต.ใหม่ ', hospcode: '10954' }),
  }));

  expect(response.status).toBe(201);
  expect(createCenter.mock.calls[0][0].data).toMatchObject({ name: 'รพ.สต.ใหม่', hospcode: '10954' });
});

test('renaming a รพ.สต. moves its accounts to the new name', async () => {
  const { PATCH } = await import('@/app/api/admin/health-centers/[healthCenterId]/route');
  moveUsers.mockResolvedValue({ count: 3 });

  const response = await PATCH(send('PATCH', { name: 'รพ.สต.ปลาโหลใหม่', hospcode: '03912' }), params);

  expect(response.status).toBe(200);
  expect(moveUsers).toHaveBeenCalledWith({ where: { healthCenter: 'รพ.สต.ปลาโหล' }, data: { healthCenter: 'รพ.สต.ปลาโหลใหม่' } });
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'health_center.updated' }) });
});

test('a รพ.สต. that still has accounts cannot be removed', async () => {
  const { DELETE } = await import('@/app/api/admin/health-centers/[healthCenterId]/route');
  countUsers.mockResolvedValueOnce(2);
  expect((await DELETE(send('DELETE'), params)).status).toBe(409);
  expect(deleteCenter).not.toHaveBeenCalled();

  countUsers.mockResolvedValueOnce(0);
  expect((await DELETE(send('DELETE'), params)).status).toBe(204);
  expect(deleteCenter).toHaveBeenCalledWith({ where: { id: 'HC1' } });
});

test('only admins manage the list, and a hospcode is required', async () => {
  const { PATCH } = await import('@/app/api/admin/health-centers/[healthCenterId]/route');
  expect((await PATCH(send('PATCH', { name: 'รพ.สต.ปลาโหล', hospcode: '' }), params)).status).toBe(422);
  currentSession.mockResolvedValue({ id: 'p1', role: 'pharmacy', displayName: 'P' });
  expect((await PATCH(send('PATCH', { name: 'รพ.สต.ปลาโหล', hospcode: '1' }), params)).status).toBe(403);
});
