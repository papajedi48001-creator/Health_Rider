import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, findZone, findZones, updateZone, updateZones, findCenter, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), findZone: vi.fn(), findZones: vi.fn(), updateZone: vi.fn(), updateZones: vi.fn(), findCenter: vi.fn(), createAudit: vi.fn(),
}));
const tx = {
  deliveryZone: { findUnique: findZone, findMany: findZones, update: updateZone, updateMany: updateZones },
  healthCenter: { findUnique: findCenter },
  auditEvent: { create: createAudit },
};
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { ...tx, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const send = (url: string, method: string, body: unknown) => new NextRequest(`http://localhost${url}`, {
  method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const zoneParams = { params: Promise.resolve({ zoneId: 'Z1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'admin' });
  findZone.mockResolvedValue({ id: 'Z1', displayName: 'หมู่ 3', subdistrictName: null, active: true, healthCenterId: null });
  updateZone.mockImplementation(async ({ data }) => ({ id: 'Z1', displayName: 'หมู่ 3', subdistrictName: null, active: true, healthCenterId: null, ...data }));
  findCenter.mockResolvedValue({ id: 'HC6' });
});

test('an admin sets the รพ.สต. of a zone, and an empty choice clears it', async () => {
  const { PATCH } = await import('@/app/api/admin/zones/[zoneId]/route');

  expect((await PATCH(send('/api/admin/zones/Z1', 'PATCH', { healthCenterId: 'HC6' }), zoneParams)).status).toBe(200);
  expect(updateZone.mock.calls[0][0].data).toEqual({ healthCenterId: 'HC6' });
  expect(createAudit.mock.calls[0][0].data.newValues).toMatchObject({ healthCenterId: 'HC6' });

  expect((await PATCH(send('/api/admin/zones/Z1', 'PATCH', { healthCenterId: '' }), zoneParams)).status).toBe(200);
  expect(updateZone.mock.calls[1][0].data).toEqual({ healthCenterId: null });
});

test('a รพ.สต. that does not exist is refused', async () => {
  const { PATCH } = await import('@/app/api/admin/zones/[zoneId]/route');
  findCenter.mockResolvedValue(null);

  const response = await PATCH(send('/api/admin/zones/Z1', 'PATCH', { healthCenterId: 'nope' }), zoneParams);

  expect(response.status).toBe(422);
  expect(updateZone).not.toHaveBeenCalled();
});

test('one รพ.สต. is set on every zone of a subdistrict at once, auditing only zones that change', async () => {
  const { PUT } = await import('@/app/api/admin/zones/health-center/route');
  findZones.mockResolvedValue([{ id: 'Z1', healthCenterId: null }, { id: 'Z2', healthCenterId: 'HC6' }, { id: 'Z3', healthCenterId: 'HC1' }]);

  const response = await PUT(send('/api/admin/zones/health-center', 'PUT', { zoneIds: ['Z1', 'Z2', 'Z3'], healthCenterId: 'HC6' }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ updated: 2 });
  expect(updateZones).toHaveBeenCalledWith({ where: { id: { in: ['Z1', 'Z3'] } }, data: { healthCenterId: 'HC6' } });
  expect(createAudit).toHaveBeenCalledTimes(2);
});

test('only admins may set the รพ.สต. of zones', async () => {
  const { PUT } = await import('@/app/api/admin/zones/health-center/route');
  currentSession.mockResolvedValue({ id: 'pharm-1', role: 'pharmacy', displayName: 'pharmacy' });

  const response = await PUT(send('/api/admin/zones/health-center', 'PUT', { zoneIds: ['Z1'], healthCenterId: 'HC6' }));

  expect(response.status).toBe(403);
  expect(updateZones).not.toHaveBeenCalled();
});
