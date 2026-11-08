import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, findUnique, update, remove, deleteAttempts, deleteTokens, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), findUnique: vi.fn(), update: vi.fn(), remove: vi.fn(), deleteAttempts: vi.fn(), deleteTokens: vi.fn(), createAudit: vi.fn(),
}));
const tx = {
  $queryRaw: vi.fn(),
  deliveryRequest: { findUnique, update, delete: remove },
  deliveryAttempt: { deleteMany: deleteAttempts },
  packageQrToken: { deleteMany: deleteTokens },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const pharmacist = { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' };
const params = { params: Promise.resolve({ requestId: 'req-1' }) };
const call = (method: string, body: unknown) => new NextRequest('http://localhost/api/pharmacy/requests/req-1', {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const job = (attempts: Array<Record<string, unknown>>) => ({
  id: 'req-1', deliveryVersion: 2, hosVisitNumber: 'VN-1', hn: 'HN-1', patientName: 'ผู้ป่วยทดสอบ', telephone: '0800000000',
  deliveryAddress: 'บ้านเดิม', deliveryZoneId: 'zone-1', createdAt: new Date('2026-11-02T01:00:00Z'), attempts,
});

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue(pharmacist);
});

test('edits the address of a package waiting for a rider and logs old and new values with the reason', async () => {
  const { PATCH } = await import('@/app/api/pharmacy/requests/[requestId]/route');
  findUnique.mockResolvedValue(job([{ status: 'prepared' }]));

  const response = await PATCH(call('PATCH', { deliveryAddress: ' บ้านใหม่ ', telephone: '0800000000', reason: 'ญาติแจ้งย้ายบ้าน', expectedVersion: 2 }), params);

  expect(response.status).toBe(200);
  expect(update).toHaveBeenCalledWith({ where: { id: 'req-1' }, data: { deliveryAddress: 'บ้านใหม่', deliveryVersion: 3 } });
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
    action: 'delivery_request.amended_before_pickup', actorId: 'pharmacy-1', reason: 'ญาติแจ้งย้ายบ้าน',
    oldValues: { deliveryAddress: 'บ้านเดิม', deliveryVersion: 2 }, newValues: { deliveryAddress: 'บ้านใหม่', deliveryVersion: 3 },
  }) });
});

test('needs a reason, refuses a job a rider has claimed, and refuses a stale version', async () => {
  const { PATCH } = await import('@/app/api/pharmacy/requests/[requestId]/route');
  expect((await PATCH(call('PATCH', { deliveryAddress: 'บ้านใหม่', reason: ' ', expectedVersion: 2 }), params)).status).toBe(422);

  findUnique.mockResolvedValue(job([{ status: 'claimed' }]));
  expect((await PATCH(call('PATCH', { deliveryAddress: 'บ้านใหม่', reason: 'ย้ายบ้าน', expectedVersion: 2 }), params)).status).toBe(409);

  findUnique.mockResolvedValue(job([]));
  expect((await PATCH(call('PATCH', { deliveryAddress: 'บ้านใหม่', reason: 'ย้ายบ้าน', expectedVersion: 1 }), params)).status).toBe(409);
  expect(update).not.toHaveBeenCalled();
  expect(createAudit).not.toHaveBeenCalled();
});

test('a rider cannot edit or delete pharmacy jobs', async () => {
  const { PATCH, DELETE } = await import('@/app/api/pharmacy/requests/[requestId]/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  expect((await PATCH(call('PATCH', { deliveryAddress: 'x', reason: 'x', expectedVersion: 2 }), params)).status).toBe(403);
  expect((await DELETE(call('DELETE', { reason: 'x' }), params)).status).toBe(403);
});

test('deletes a waiting package with its QR and keeps a snapshot of the job in the audit log', async () => {
  const { DELETE } = await import('@/app/api/pharmacy/requests/[requestId]/route');
  findUnique.mockResolvedValue(job([{ id: 'att-1', status: 'prepared', riderId: null }]));
  deleteAttempts.mockResolvedValue({ count: 1 });

  const response = await DELETE(call('DELETE', { reason: 'ผู้ป่วยมารับยาเอง' }), params);

  expect(response.status).toBe(200);
  expect(deleteTokens).toHaveBeenCalledWith({ where: { deliveryAttemptId: { in: ['att-1'] } } });
  expect(remove).toHaveBeenCalledWith({ where: { id: 'req-1' } });
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
    action: 'delivery_request.deleted', auditableId: 'req-1', reason: 'ผู้ป่วยมารับยาเอง',
    oldValues: expect.objectContaining({ hn: 'HN-1', patientName: 'ผู้ป่วยทดสอบ', deliveryAddress: 'บ้านเดิม', deletedPackageIds: ['att-1'] }),
  }) });
});

test('refuses to delete without a reason or a job with delivery history', async () => {
  const { DELETE } = await import('@/app/api/pharmacy/requests/[requestId]/route');
  expect((await DELETE(call('DELETE', {}), params)).status).toBe(422);

  findUnique.mockResolvedValue(job([{ id: 'att-2', status: 'prepared', riderId: null }, { id: 'att-1', status: 'returned', riderId: 'rider-1' }]));
  const response = await DELETE(call('DELETE', { reason: 'ไม่ต้องส่งแล้ว' }), params);
  expect(response.status).toBe(409);
  await expect(response.json()).resolves.toEqual({ message: 'งานนี้มีประวัติการจัดส่งแล้ว ลบไม่ได้' });
  expect(remove).not.toHaveBeenCalled();
  expect(createAudit).not.toHaveBeenCalled();
});
