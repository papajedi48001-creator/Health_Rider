import { generateKeyPairSync, sign } from 'node:crypto';
import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { installationIdFor } from '@/license/installation';
import { canonicalJson } from '@/license/license';

const keys = vi.hoisted(() => ({ publicBase64: '' }));
const { findSetting, findSettings, upsertSetting, countUsers, countRequests, createAudit, currentSession } = vi.hoisted(() => ({
  findSetting: vi.fn(), findSettings: vi.fn(), upsertSetting: vi.fn(), countUsers: vi.fn(), countRequests: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(),
}));
const tx = { systemSetting: { upsert: upsertSetting }, auditEvent: { create: createAudit }, user: { count: countUsers } };

vi.mock('@/license/public-key', () => ({ get licensePublicKey() { return keys.publicBase64; } }));
// No machine ID in tests: the installation ID rests on the stored secret alone.
vi.mock('@/license/installation', async (original) => ({ ...await original<typeof import('@/license/installation')>(), readMachineId: async () => '', newInstallationSecret: () => 'test-secret' }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: {
    systemSetting: { findUnique: findSetting, findMany: findSettings, upsert: upsertSetting },
    user: { count: countUsers },
    deliveryRequest: { count: countRequests },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
keys.publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const installationId = installationIdFor('test-secret', '');

function token(body: Record<string, unknown>) {
  const payload = Buffer.from(canonicalJson({
    v: 1, product: 'health-rider', keyId: 'HRL-2569-0001', licensee: { name: 'โรงพยาบาลตัวอย่าง' }, installationId,
    plan: 'yearly', issuedAt: '2026-11-01', expiresAt: '2099-10-31', maxRiders: 2, maxDeliveriesPerMonth: 500, ...body,
  }));
  return `HR1.${payload.toString('base64url')}.${sign(null, payload, privateKey).toString('base64url')}`;
}

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };
const settings = new Map<string, unknown>();

function request(url: string, method: string, json?: unknown) {
  return new NextRequest(`http://localhost${url}`, { method, body: json === undefined ? undefined : JSON.stringify(json) });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.clear();
  currentSession.mockResolvedValue(null);
  findSetting.mockImplementation(async ({ where }) => (settings.has(where.key) ? { key: where.key, value: settings.get(where.key) } : null));
  findSettings.mockImplementation(async ({ where }) => (where.key.in as string[]).filter((key) => settings.has(key)).map((key) => ({ key, value: settings.get(key) })));
  upsertSetting.mockImplementation(async ({ where, create, update }) => {
    const value = settings.has(where.key) ? update.value ?? settings.get(where.key) : create.value;
    settings.set(where.key, value);
    return { key: where.key, value };
  });
  countUsers.mockResolvedValue(1);
  countRequests.mockResolvedValue(612);
});

test('a fresh install is locked and shows its installation ID; a key for it opens the app without signing in', async () => {
  const { GET, POST } = await import('@/app/api/license/route');
  expect(await (await GET()).json()).toMatchObject({ status: 'unactivated', locked: true, installationId });

  const response = await POST(request('/api/license', 'POST', { token: token({}) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'active', locked: false, licensee: 'โรงพยาบาลตัวอย่าง' });
  // Once open, the lock screen's view no longer gives out the installation ID.
  expect(await (await GET()).json()).toMatchObject({ locked: false, installationId: null });
});

test('a key for another machine or changed after signing is refused and nothing is stored', async () => {
  const { POST } = await import('@/app/api/license/route');
  expect((await POST(request('/api/license', 'POST', { token: token({ installationId: installationIdFor('other', '') }) }))).status).toBe(422);
  const [prefix, , signature] = token({}).split('.');
  const forged = Buffer.from(canonicalJson({ v: 1, maxRiders: 200 })).toString('base64url');
  expect((await POST(request('/api/license', 'POST', { token: `${prefix}.${forged}.${signature}` }))).status).toBe(422);
  expect(settings.has('license')).toBe(false);
});

test('once open, only an admin can change the key, a shorter key is refused, and a renewal is audited', async () => {
  const { POST } = await import('@/app/api/license/route');
  await POST(request('/api/license', 'POST', { token: token({}) }));

  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });
  expect((await POST(request('/api/license', 'POST', { token: token({ keyId: 'HRL-2569-0002', plan: 'lifetime', expiresAt: null }) }))).status).toBe(403);

  currentSession.mockResolvedValue(admin);
  const shorter = await POST(request('/api/license', 'POST', { token: token({ keyId: 'HRL-2569-0003', expiresAt: '2098-01-01' }) }));
  expect(shorter.status).toBe(422);
  expect((await shorter.json()).message).toMatch(/หมดอายุก่อน/);

  expect((await POST(request('/api/license', 'POST', { token: token({ keyId: 'HRL-2569-0002', plan: 'lifetime', expiresAt: null }) }))).status).toBe(200);
  expect(createAudit.mock.calls.at(-1)?.[0].data).toMatchObject({ action: 'license.activated', actorId: 'admin-1', newValues: expect.objectContaining({ keyId: 'HRL-2569-0002', plan: 'lifetime' }) });
});

test('only admins see the license details, with use against the limits', async () => {
  const { GET } = await import('@/app/api/admin/license/route');
  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });
  expect((await GET(request('/api/admin/license', 'GET'))).status).toBe(403);
  currentSession.mockResolvedValue(admin);
  expect(await (await GET(request('/api/admin/license', 'GET'))).json()).toMatchObject({ activeRiders: 1, deliveriesThisMonth: 612, license: { status: 'unactivated', installationId } });
});

test('a server clock set well behind a time already seen locks the app', async () => {
  const { currentLicenseState } = await import('@/license/license-store');
  settings.set('license', { token: token({}) });
  expect((await currentLicenseState(new Date('2026-11-08T00:00:00Z'))).locked).toBe(false);
  expect((await currentLicenseState(new Date('2026-11-07T00:00:00Z'))).locked).toBe(false);
  expect(await currentLicenseState(new Date('2026-11-05T00:00:00Z'))).toMatchObject({ status: 'clockBack', locked: true });
});

test('a new rider is refused once the license rider limit is reached', async () => {
  const { assertRiderSeatAvailable } = await import('@/license/license-store');
  settings.set('license', { token: token({}) });
  countUsers.mockResolvedValue(1);
  await expect(assertRiderSeatAvailable(tx as never)).resolves.toBeUndefined();
  countUsers.mockResolvedValue(2);
  await expect(assertRiderSeatAvailable(tx as never)).rejects.toThrow(/ไม่เกิน 2 คน/);
});
