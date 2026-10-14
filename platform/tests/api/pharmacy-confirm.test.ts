import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createRequest, findZone, createAudit, eligibleFor, currentSession } = vi.hoisted(() => ({
  createRequest: vi.fn(), findZone: vi.fn(), createAudit: vi.fn(), eligibleFor: vi.fn(), currentSession: vi.fn(),
}));
const tx = { deliveryZone: { findFirst: findZone }, deliveryRequest: { create: createRequest }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ eligibleFor }) }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const hosCandidate = {
  visitNumber: 'VN-TEST-001', hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
  telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '46', villageCode: '01',
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
  createRequest.mockImplementation(async ({ data }) => data);
});

test('rejects a rider confirming a HOS candidate', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });

  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14' }));

  expect(response.status).toBe(403);
  expect(createRequest).not.toHaveBeenCalled();
});

test('creates the request from HOS data, not from what the browser sent', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14', patientName: 'แก้ไขจาก browser' }));

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toEqual(expect.objectContaining({ hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', deliveryZoneId: 'zone-1', createdById: 'pharmacy-1' }));
  expect(body).not.toHaveProperty('rateSatangSnapshot');
  expect(createAudit).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'delivery_request.created_from_hos_candidate' }) }));
});

test('rejects a visit HOS no longer lists and a patient without a delivery zone', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  expect((await POST(confirm({ visitNumber: 'VN-UNKNOWN', date: '2026-10-14' }))).status).toBe(404);
  findZone.mockResolvedValue(null);
  const response = await POST(confirm({ visitNumber: 'VN-TEST-001', date: '2026-10-14' }));
  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toEqual({ message: 'ไม่พบโซนจัดส่งสำหรับที่อยู่ผู้ป่วย' });
  expect(createRequest).not.toHaveBeenCalled();
});
