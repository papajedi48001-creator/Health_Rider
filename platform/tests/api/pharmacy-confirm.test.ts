import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createRequest, findZone, findRates, createAudit, eligibleFor, currentSession } = vi.hoisted(() => ({
  createRequest: vi.fn(), findZone: vi.fn(), findRates: vi.fn(), createAudit: vi.fn(), eligibleFor: vi.fn(), currentSession: vi.fn(),
}));
const tx = { serviceRate: { findMany: findRates }, deliveryZone: { findFirst: findZone }, deliveryRequest: { create: createRequest }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ eligibleFor }) }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const hosCandidate = {
  visitNumber: 'VN-TEST-001', hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
  telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '470907', villageCode: '01',
};

function confirm(body: unknown) {
  return new NextRequest('http://localhost/api/pharmacy/candidates/confirm', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  eligibleFor.mockResolvedValue([hosCandidate]);
  findZone.mockResolvedValue({ id: 'zone-1' });
  findRates.mockResolvedValue([]);
  createRequest.mockImplementation(async ({ data }) => data);
});

test('rejects a rider confirming a HOSxP candidate', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });

  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14' }));

  expect(response.status).toBe(403);
  expect(createRequest).not.toHaveBeenCalled();
});

test('creates the request from HOSxP data, not from what the browser sent', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14', patientName: 'แก้ไขจาก browser' }));

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toEqual(expect.objectContaining({ hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', deliveryZoneId: 'zone-1', createdById: 'pharmacy-1' }));
  expect(body).not.toHaveProperty('rateSatangSnapshot');
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delivery_request.created_from_hos_candidate' }) }));
});

test('rejects a visit HOSxP no longer lists and a patient without a delivery zone', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  expect((await POST(confirm({ visitNumber: 'VN-UNKNOWN', date: '2026-10-14' }))).status).toBe(404);
  findZone.mockResolvedValue(null);
  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14' }));
  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toEqual({ message: 'ไม่พบโซนจัดส่งสำหรับที่อยู่ผู้ป่วย' });
  expect(createRequest).not.toHaveBeenCalled();
});

test('keeps the zone rate in effect today on the request', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
  findRates.mockResolvedValue([
    { subdistrictCode: '470907', deliveryZoneId: null, rateSatang: 3000, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') },
    { subdistrictCode: '470907', deliveryZoneId: 'zone-1', rateSatang: 5000, effectiveFrom: new Date('2026-10-01T00:00:00.000Z') },
  ]);

  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14' }));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual(expect.objectContaining({ rateSatang: 5000, rateEffectiveFrom: '2026-10-01T00:00:00.000Z' }));
  expect(findRates).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ OR: [{ deliveryZoneId: 'zone-1' }, { deliveryZoneId: null, subdistrictCode: '470907' }] }),
  }));
});
