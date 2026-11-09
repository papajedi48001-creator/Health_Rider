import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, findAttempt, deleteAttempts, deleteTokens, createAudit, deleteRequest } = vi.hoisted(() => ({
  currentSession: vi.fn(), findAttempt: vi.fn(), deleteAttempts: vi.fn(), deleteTokens: vi.fn(), createAudit: vi.fn(), deleteRequest: vi.fn(),
}));
const tx = {
  $queryRaw: vi.fn(),
  deliveryAttempt: { findUnique: findAttempt, deleteMany: deleteAttempts },
  deliveryRequest: { delete: deleteRequest },
  packageQrToken: { deleteMany: deleteTokens },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const params = { params: Promise.resolve({ attemptId: 'att-1' }) };
const call = (body: unknown) => new NextRequest('http://localhost/api/pharmacy/attempts/att-1', {
  method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const waiting = { id: 'att-1', deliveryRequestId: 'req-1', status: 'prepared', riderId: null, createdAt: new Date('2026-11-09T01:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
});

test('deleting a package waiting for a rider removes the package and its QR, keeps the job, and logs it on the job', async () => {
  const { DELETE } = await import('@/app/api/pharmacy/attempts/[attemptId]/route');
  findAttempt.mockResolvedValue(waiting);
  deleteAttempts.mockResolvedValue({ count: 1 });

  const response = await DELETE(call({ reason: 'พิมพ์ฉลากผิดคน' }), params);

  expect(response.status).toBe(200);
  expect(deleteTokens).toHaveBeenCalledWith({ where: { deliveryAttemptId: 'att-1' } });
  expect(deleteAttempts).toHaveBeenCalledWith({ where: { id: 'att-1', status: 'prepared', riderId: null } });
  expect(deleteRequest).not.toHaveBeenCalled();
  expect(createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
    action: 'delivery_attempt.deleted', auditableType: 'DeliveryRequest', auditableId: 'req-1', reason: 'พิมพ์ฉลากผิดคน', actorId: 'pharmacy-1',
  }) });
});

test('needs a reason, and refuses a package a rider has claimed or claims at the same moment', async () => {
  const { DELETE } = await import('@/app/api/pharmacy/attempts/[attemptId]/route');
  expect((await DELETE(call({ reason: ' ' }), params)).status).toBe(422);

  findAttempt.mockResolvedValue({ ...waiting, status: 'claimed', riderId: 'rider-1' });
  expect((await DELETE(call({ reason: 'ไม่ต้องส่งแล้ว' }), params)).status).toBe(409);
  expect(deleteTokens).not.toHaveBeenCalled();

  findAttempt.mockResolvedValue(waiting);
  deleteAttempts.mockResolvedValue({ count: 0 });
  expect((await DELETE(call({ reason: 'ไม่ต้องส่งแล้ว' }), params)).status).toBe(409);
  expect(createAudit).not.toHaveBeenCalled();
});

test('a rider cannot delete packages', async () => {
  const { DELETE } = await import('@/app/api/pharmacy/attempts/[attemptId]/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  expect((await DELETE(call({ reason: 'x' }), params)).status).toBe(403);
});
