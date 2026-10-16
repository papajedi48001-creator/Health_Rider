import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findSetting, upsertSetting, deleteSettings, createAudit, currentSession } = vi.hoisted(() => ({
  findSetting: vi.fn(), upsertSetting: vi.fn(), deleteSettings: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(),
}));
const tx = { systemSetting: { upsert: upsertSetting, deleteMany: deleteSettings }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/system-info', () => ({ systemInfo: async () => ({ basePath: '/health-rider' }) }));
vi.mock('@/lib/db', () => ({
  db: { systemSetting: { findUnique: findSetting }, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) },
}));

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };
const form = { host: '192.168.1.254', port: '3306', user: 'hr_hos_read', database: 'hos', password: 'very-secret', eligibleItemCodes: '1000001, 1000002' };

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/admin/settings', { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_SECRET', 's'.repeat(48));
  vi.stubEnv('HOS_DATABASE_URL', '');
  vi.stubEnv('HOS_ELIGIBLE_ITEM_CODES', '');
  findSetting.mockResolvedValue(null);
  upsertSetting.mockImplementation(async ({ create }) => {
    findSetting.mockResolvedValue({ value: create.value });
    return create;
  });
});

test('only admins can read or change settings', async () => {
  const { GET, PUT } = await import('@/app/api/admin/settings/route');
  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });

  expect((await GET(request('GET'))).status).toBe(403);
  expect((await PUT(request('PUT', form))).status).toBe(403);
  expect(upsertSetting).not.toHaveBeenCalled();
});

test('saves HOSxP settings with the password sealed and audited without it', async () => {
  const { GET, PUT } = await import('@/app/api/admin/settings/route');
  currentSession.mockResolvedValue(admin);

  const response = await PUT(request('PUT', form));

  expect(response.status).toBe(200);
  const stored = upsertSetting.mock.calls[0]?.[0].create.value;
  expect(stored).toMatchObject({ host: '192.168.1.254', port: 3306, user: 'hr_hos_read', database: 'hos', eligibleItemCodes: ['1000001', '1000002'] });
  expect(stored.password).toMatch(/^v1:/);
  expect(JSON.stringify(createAudit.mock.calls)).not.toContain('very-secret');
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'system_setting.updated', newValues: expect.objectContaining({ passwordChanged: true }) });

  const body = await (await GET(request('GET'))).json();
  expect(body.hos).toMatchObject({ source: 'system', host: '192.168.1.254', hasPassword: true });
  expect(JSON.stringify(body)).not.toContain('very-secret');
  expect(JSON.stringify(body)).not.toContain(stored.password);
});

test('rejects a form without a password when none is set yet', async () => {
  const { PUT } = await import('@/app/api/admin/settings/route');
  currentSession.mockResolvedValue(admin);

  const response = await PUT(request('PUT', { ...form, password: '' }));

  expect(response.status).toBe(422);
  expect(upsertSetting).not.toHaveBeenCalled();
});

test('going back to .env removes the saved settings', async () => {
  const { DELETE } = await import('@/app/api/admin/settings/route');
  currentSession.mockResolvedValue(admin);
  deleteSettings.mockResolvedValue({ count: 1 });

  const response = await DELETE(request('DELETE'));

  expect(response.status).toBe(200);
  expect(deleteSettings).toHaveBeenCalledWith({ where: { key: 'hos' } });
  expect(createAudit.mock.calls[0]?.[0].data.action).toBe('system_setting.reset');
});
