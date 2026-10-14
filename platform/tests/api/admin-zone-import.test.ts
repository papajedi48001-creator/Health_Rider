import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findZones, createZone, nameZones, createAudit, villagesSince, currentSession } = vi.hoisted(() => ({
  findZones: vi.fn(), createZone: vi.fn(), nameZones: vi.fn(), createAudit: vi.fn(), villagesSince: vi.fn(), currentSession: vi.fn(),
}));
const tx = { deliveryZone: { findMany: findZones, create: createZone, updateMany: nameZones }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: () => ({ villagesSince }) }));
vi.mock('@/lib/db', () => ({ db: { deliveryZone: { findMany: findZones }, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };

beforeEach(() => {
  vi.clearAllMocks();
  findZones.mockResolvedValue([{ subdistrictCode: '470603', villageCode: '06' }]);
  createZone.mockImplementation(async ({ data }) => data);
  villagesSince.mockResolvedValue([
    { subdistrictCode: '470603', villageCode: '06', subdistrictName: 'ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร', visits: 48 },
    { subdistrictCode: '470603', villageCode: '07', subdistrictName: null, visits: 24 },
  ]);
});

test('previews HOS villages with names and which ones already have a zone', async () => {
  const { GET } = await import('@/app/api/admin/zone-import/route');
  currentSession.mockResolvedValue(admin);

  const response = await GET(new NextRequest('http://localhost/api/admin/zone-import'));

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.villages).toEqual([
    expect.objectContaining({ villageCode: '06', displayName: 'หมู่ 6 ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร', exists: true }),
    expect.objectContaining({ villageCode: '07', displayName: 'หมู่ 7 ตำบล 470603', exists: false }),
  ]);
});

test('creates only the zones that do not exist yet, with an audit event each', async () => {
  const { POST } = await import('@/app/api/admin/zone-import/route');
  currentSession.mockResolvedValue(admin);

  const response = await POST(new NextRequest('http://localhost/api/admin/zone-import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ zones: [
      { subdistrictCode: '470603', villageCode: '06', displayName: 'หมู่ 6' },
      { subdistrictCode: '470603', villageCode: '7', displayName: 'หมู่ 7' },
    ] }),
  }));

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toEqual({ created: 1 });
  expect(createZone).toHaveBeenCalledWith({ data: expect.objectContaining({ subdistrictCode: '470603', villageCode: '07', displayName: 'หมู่ 7' }) });
  expect(createAudit).toHaveBeenCalledTimes(1);
});

test('rejects a pharmacist importing zones', async () => {
  const { POST } = await import('@/app/api/admin/zone-import/route');
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const response = await POST(new NextRequest('http://localhost/api/admin/zone-import', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ zones: [] }),
  }));

  expect(response.status).toBe(403);
  expect(createZone).not.toHaveBeenCalled();
});

test('fills in a missing subdistrict name on zones that already exist', async () => {
  const { POST } = await import('@/app/api/admin/zone-import/route');
  currentSession.mockResolvedValue(admin);

  const response = await POST(new NextRequest('http://localhost/api/admin/zone-import', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ zones: [{ subdistrictCode: '470603', subdistrictName: 'ต.ปลาโหล', villageCode: '06', displayName: 'หมู่ 6' }] }),
  }));

  await expect(response.json()).resolves.toEqual({ created: 0 });
  expect(createZone).not.toHaveBeenCalled();
  expect(nameZones).toHaveBeenCalledWith({ where: { subdistrictCode: '470603', subdistrictName: null }, data: { subdistrictName: 'ต.ปลาโหล' } });
});
