import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { canonicalJson } from '@/license/license';

const keys = vi.hoisted(() => ({ publicBase64: '' }));
const { findSetting, upsertSetting, countUsers, createAudit, currentSession } = vi.hoisted(() => ({
  findSetting: vi.fn(), upsertSetting: vi.fn(), countUsers: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(),
}));
const tx = { systemSetting: { upsert: upsertSetting }, auditEvent: { create: createAudit }, user: { count: countUsers } };

vi.mock('@/license/public-key', () => ({ get licensePublicKey() { return keys.publicBase64; } }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { findUnique: findSetting, upsert: upsertSetting },
    user: { count: countUsers },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
keys.publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const body = {
  licenseId: 'HR-2026-0001', product: 'health-rider', licensee: { name: 'โรงพยาบาลตัวอย่าง', hcode: '10999', province: 'สกลนคร' },
  type: 'subscription', issuedAt: '2026-10-01', expiresAt: '2099-09-30', updatesUntil: '2099-09-30', maxRiders: 2,
};
const licenseText = JSON.stringify({ ...body, signature: sign(null, Buffer.from(canonicalJson(body)), privateKey).toString('base64') });
const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };
const settings = new Map<string, unknown>();

function request(method: string, json?: unknown) {
  return new NextRequest('http://localhost/api/admin/license', { method, body: json === undefined ? undefined : JSON.stringify(json) });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.clear();
  findSetting.mockImplementation(async ({ where }) => (settings.has(where.key) ? { value: settings.get(where.key) } : null));
  upsertSetting.mockImplementation(async ({ where, create, update }) => {
    const value = settings.has(where.key) ? update.value ?? settings.get(where.key) : create.value;
    settings.set(where.key, value);
    return { key: where.key, value };
  });
  countUsers.mockResolvedValue(1);
});

test('only admins can see or install the license', async () => {
  const { GET, PUT } = await import('@/app/api/admin/license/route');
  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });
  expect((await GET(request('GET'))).status).toBe(403);
  expect((await PUT(request('PUT', { text: licenseText }))).status).toBe(403);
});

test('a fresh install is on trial, and installing a signed file makes it active and audits it', async () => {
  const { GET, PUT } = await import('@/app/api/admin/license/route');
  currentSession.mockResolvedValue(admin);

  expect((await (await GET(request('GET'))).json()).license.status).toBe('trial');

  const response = await PUT(request('PUT', { text: licenseText }));
  expect(response.status).toBe(200);
  expect((await response.json()).license).toMatchObject({ status: 'active', writable: true, license: { licensee: { hcode: '10999' } } });
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'license.installed', newValues: expect.objectContaining({ licenseId: 'HR-2026-0001' }) });
});

test('a file changed after signing is refused and nothing is stored', async () => {
  const { PUT } = await import('@/app/api/admin/license/route');
  currentSession.mockResolvedValue(admin);
  const response = await PUT(request('PUT', { text: licenseText.replace('"maxRiders":2', '"maxRiders":200') }));
  expect(response.status).toBe(422);
  expect(settings.has('license')).toBe(false);
});

test('a new rider is refused once the license rider limit is reached', async () => {
  const { assertRiderSeatAvailable } = await import('@/license/license-store');
  settings.set('license', { text: licenseText });
  countUsers.mockResolvedValue(1);
  await expect(assertRiderSeatAvailable(tx as never)).resolves.toBeUndefined();
  countUsers.mockResolvedValue(2);
  await expect(assertRiderSeatAvailable(tx as never)).rejects.toThrow(/ไม่เกิน 2 คน/);
});
