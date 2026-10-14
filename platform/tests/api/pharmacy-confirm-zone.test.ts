import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createRequest, findZone, findRequests, createAudit, eligibleFor, currentSession } = vi.hoisted(() => ({
  createRequest: vi.fn(), findZone: vi.fn(), findRequests: vi.fn(), createAudit: vi.fn(), eligibleFor: vi.fn(), currentSession: vi.fn(),
}));
const tx = { deliveryRequest: { create: createRequest }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ eligibleFor }) }));
vi.mock('@/lib/db', () => ({
  db: {
    deliveryZone: { findFirst: findZone },
    deliveryRequest: { findMany: findRequests },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

const candidate = (visitNumber: string, villageCode: string) => ({
  visitNumber, hn: `HN-${visitNumber}`, patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
  telephone: null, deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '470907', villageCode,
});

function confirmZone(body: unknown) {
  return new NextRequest('http://localhost/api/pharmacy/candidates/confirm-zone', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  findZone.mockResolvedValue({ id: 'zone-6', subdistrictCode: '470907', villageCode: '06', displayName: 'หมู่ 6', active: true });
  eligibleFor.mockResolvedValue([candidate('VN-1', '06'), candidate('VN-2', '06'), candidate('VN-3', '06'), candidate('VN-4', '02')]);
  findRequests.mockResolvedValue([{ hosVisitNumber: 'VN-2' }]);
  createRequest.mockImplementation(async ({ data }) => data);
});

test('rejects a rider confirming a zone', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm-zone/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });

  expect((await POST(confirmZone({ zoneId: 'zone-6', date: '2026-10-08' }))).status).toBe(403);
  expect(createRequest).not.toHaveBeenCalled();
});

test('confirms only the unconfirmed HOS visits that map to the zone', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm-zone/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const response = await POST(confirmZone({ zoneId: 'zone-6', date: '2026-10-08' }));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ confirmed: 2, visitNumbers: ['VN-1', 'VN-3'] });
  expect(createRequest).toHaveBeenCalledTimes(2);
  expect(createRequest).toHaveBeenCalledWith({ data: expect.objectContaining({ hosVisitNumber: 'VN-1', deliveryZoneId: 'zone-6', createdById: 'pharmacy-1' }) });
  expect(createAudit).toHaveBeenCalledTimes(2);
});

test('rejects an unknown or inactive zone', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm-zone/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
  findZone.mockResolvedValue(null);

  expect((await POST(confirmZone({ zoneId: 'zone-x', date: '2026-10-08' }))).status).toBe(404);
  expect(createRequest).not.toHaveBeenCalled();
});
