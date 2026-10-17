import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createRequest, findZones, findRequests, createAudit, eligibleFor, currentSession } = vi.hoisted(() => ({
  createRequest: vi.fn(), findZones: vi.fn(), findRequests: vi.fn(), createAudit: vi.fn(), eligibleFor: vi.fn(), currentSession: vi.fn(),
}));
const tx = { serviceRate: { findMany: async () => [] }, deliveryRequest: { create: createRequest }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ eligibleFor }) }));
vi.mock('@/lib/db', () => ({
  db: {
    deliveryZone: { findMany: findZones },
    deliveryRequest: { findMany: findRequests },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

const candidate = (visitNumber: string, villageCode: string) => ({
  visitNumber, hn: `HN-${visitNumber}`, patientName: `ผู้ป่วย ${visitNumber}`, patientAge: 64,
  telephone: null, deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '470907', villageCode,
});
const pharmacist = { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' };

function confirmMany(body: unknown) {
  return new NextRequest('http://localhost/api/pharmacy/candidates/confirm-many', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}
const route = () => import('@/app/api/pharmacy/candidates/confirm-many/route');

beforeEach(() => {
  vi.clearAllMocks();
  findZones.mockResolvedValue([{ id: 'zone-6', subdistrictCode: '470907', villageCode: '06' }]);
  eligibleFor.mockResolvedValue([candidate('VN-1', '06'), candidate('VN-2', '06'), candidate('VN-3', '09'), candidate('VN-4', '06'), candidate('VN-5', '06')]);
  findRequests.mockResolvedValue([{ hosVisitNumber: 'VN-2' }]);
  createRequest.mockImplementation(async ({ data }) => data);
});

test('only pharmacy and admins confirm many visits', async () => {
  const { POST } = await route();
  currentSession.mockResolvedValue({ ...pharmacist, role: 'rider' });
  expect((await POST(confirmMany({ visitNumbers: ['VN-1'], date: '2026-10-08' }))).status).toBe(403);
  expect(createRequest).not.toHaveBeenCalled();
});

test('creates a job for each listed visit and reports the ones it could not create', async () => {
  const { POST } = await route();
  currentSession.mockResolvedValue(pharmacist);

  const response = await POST(confirmMany({ visitNumbers: ['VN-1', 'VN-2', 'VN-3', 'VN-4', 'VN-9'], date: '2026-10-08' }));

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body.confirmed).toBe(2);
  expect(body.visitNumbers).toEqual(['VN-1', 'VN-4']);
  expect(body.failed).toEqual(expect.arrayContaining([
    { visitNumber: 'VN-2', patientName: 'ผู้ป่วย VN-2', reason: 'ยืนยันไปแล้ว' },
    { visitNumber: 'VN-3', patientName: 'ผู้ป่วย VN-3', reason: 'ไม่พบโซนจัดส่งสำหรับที่อยู่ผู้ป่วย' },
    { visitNumber: 'VN-9', patientName: null, reason: expect.stringContaining('ไม่พบ') },
  ]));
  expect(body.failed).toHaveLength(3);
  // VN-5 was not in the list, so it is left alone.
  expect(createRequest.mock.calls.map(([{ data }]) => data.hosVisitNumber)).toEqual(['VN-1', 'VN-4']);
  expect(createRequest.mock.calls[0]?.[0].data).toMatchObject({ deliveryZoneId: 'zone-6', createdById: 'pharmacy-1' });
  expect(createAudit).toHaveBeenCalledTimes(2);
});

test('one visit failing to save does not stop the others', async () => {
  const { POST } = await route();
  currentSession.mockResolvedValue(pharmacist);
  createRequest.mockRejectedValueOnce(new Error('database hiccup'));

  const body = await (await POST(confirmMany({ visitNumbers: ['VN-1', 'VN-4'], date: '2026-10-08' }))).json();

  expect(body.visitNumbers).toEqual(['VN-4']);
  expect(body.failed).toEqual([{ visitNumber: 'VN-1', patientName: 'ผู้ป่วย VN-1', reason: 'บันทึกไม่สำเร็จ' }]);
});

test('rejects an empty list or a bad date', async () => {
  const { POST } = await route();
  currentSession.mockResolvedValue(pharmacist);
  expect((await POST(confirmMany({ visitNumbers: [], date: '2026-10-08' }))).status).toBe(422);
  expect((await POST(confirmMany({ visitNumbers: ['VN-1'], date: 'yesterday' }))).status).toBe(422);
  expect((await POST(confirmMany({ visitNumbers: [1], date: '2026-10-08' }))).status).toBe(422);
  expect(eligibleFor).not.toHaveBeenCalled();
});
