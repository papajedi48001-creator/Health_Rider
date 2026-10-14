import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findZone, findAnyZone, createRate, createAudit, currentSession } = vi.hoisted(() => ({
  findZone: vi.fn(), findAnyZone: vi.fn(), createRate: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(),
}));
const tx = { deliveryZone: { findUnique: findZone, findFirst: findAnyZone }, serviceRate: { create: createRate }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };

function post(body: unknown) {
  return new NextRequest('http://localhost/api/admin/rates', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue(admin);
  findZone.mockResolvedValue({ subdistrictCode: '470603' });
  findAnyZone.mockResolvedValue({ id: 'zone-6' });
  createRate.mockImplementation(async ({ data }) => data);
});

test('adds a whole-subdistrict rate in satang with an audit event', async () => {
  const { POST } = await import('@/app/api/admin/rates/route');

  const response = await POST(post({ subdistrictCode: '470603', deliveryZoneId: '', baht: '30', effectiveFrom: '2026-11-01' }));

  expect(response.status).toBe(201);
  expect(createRate).toHaveBeenCalledWith({ data: expect.objectContaining({ subdistrictCode: '470603', deliveryZoneId: null, rateSatang: 3000, createdById: 'admin-1' }) });
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'service_rate.created' }) }));
});

test('rejects a zone rate whose zone is in another subdistrict', async () => {
  const { POST } = await import('@/app/api/admin/rates/route');
  findZone.mockResolvedValue({ subdistrictCode: '470602' });

  const response = await POST(post({ subdistrictCode: '470603', deliveryZoneId: 'zone-1', baht: '40', effectiveFrom: '2026-11-01' }));

  expect(response.status).toBe(422);
  expect(createRate).not.toHaveBeenCalled();
});

test('rejects a pharmacist setting a rate', async () => {
  const { POST } = await import('@/app/api/admin/rates/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  expect((await POST(post({ subdistrictCode: '470603', baht: '30', effectiveFrom: '2026-11-01' }))).status).toBe(403);
  expect(createRate).not.toHaveBeenCalled();
});
