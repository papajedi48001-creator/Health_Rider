import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createAudit, currentSession } = vi.hoisted(() => ({ createAudit: vi.fn(), currentSession: vi.fn() }));

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { auditEvent: { create: createAudit } } }));
// This build is 1.1.0; the host has also fetched 1.2.0.
vi.mock('@/domain/system-update/bundled-release', () => {
  const entry = (version: string, schemaChange = false) => ({ version, releasedAt: '2026-11-09T01:00:00+07:00', title: `รุ่น ${version}`, whatsNew: ['ปรับปรุง'], schemaChange });
  return {
    bundledManifest: { rollbackFloor: '1.0.0', releases: [entry('1.1.0', true), entry('1.0.0')] },
    runningRelease: entry('1.1.0', true),
  };
});

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };
const entry = (version: string, schemaChange = false) => ({ version, releasedAt: '2026-11-09T01:00:00+07:00', title: `รุ่น ${version}`, whatsNew: ['ปรับปรุง'], schemaChange });
let folder = '';

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/admin/system-update', { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function hostReports(extra: Record<string, unknown> = {}) {
  await writeFile(path.join(folder, 'status.json'), JSON.stringify({
    checkedAt: new Date().toISOString(), fetchedAt: new Date().toISOString(), current: '1.1.0', deployedRef: 'v1.1.0',
    rollbackFloor: '1.0.0', releases: [entry('1.2.0'), entry('1.1.0', true), entry('1.0.0')], job: null, history: [], ...extra,
  }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  folder = await mkdtemp(path.join(os.tmpdir(), 'hr-updater-'));
  vi.stubEnv('UPDATER_STATE_PATH', folder);
  currentSession.mockResolvedValue(admin);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(folder, { recursive: true, force: true });
});

test('only admins can see or change versions', async () => {
  const { GET, POST } = await import('@/app/api/admin/system-update/route');
  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });
  expect((await GET(request('GET'))).status).toBe(403);
  expect((await POST(request('POST', { action: 'change', version: '1.2.0', reason: 'x' }))).status).toBe(403);
});

test('lists the versions the host fetched, marked against the running one', async () => {
  const { GET } = await import('@/app/api/admin/system-update/route');
  await hostReports();
  const body = await (await GET(request('GET'))).json();
  expect(body.current.version).toBe('1.1.0');
  expect(body.rollbackFloor).toBe('1.0.0');
  expect(body.releases.map((release: { version: string; relation: string }) => `${release.version}:${release.relation}`)).toEqual(['1.2.0:newer', '1.1.0:current', '1.0.0:older']);
  expect(body.updater).toMatchObject({ configured: true, writable: true, reporting: true });
});

test('an update leaves one request for the host and is audited with its reason', async () => {
  const { POST } = await import('@/app/api/admin/system-update/route');
  await hostReports();
  const response = await POST(request('POST', { action: 'change', version: '1.2.0', reason: 'ติดตั้งฟีเจอร์ใหม่' }));
  expect(response.status).toBe(202);
  const left = JSON.parse(await readFile(path.join(folder, 'request.json'), 'utf8'));
  expect(left).toMatchObject({ action: 'update', version: '1.2.0', from: '1.1.0', reason: 'ติดตั้งฟีเจอร์ใหม่', requestedBy: { id: 'admin-1', name: 'ผู้ดูแล' } });
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'system.update_requested', auditableId: '1.2.0', reason: 'ติดตั้งฟีเจอร์ใหม่' });
  expect((await response.json()).busy).toBe(true);

  // A second request waits until the first is taken or cancelled.
  expect((await POST(request('POST', { action: 'change', version: '1.0.0', reason: 'ลองย้อน' }))).status).toBe(409);
});

test('a rollback needs a reason and warns when it passes a database change', async () => {
  const { POST } = await import('@/app/api/admin/system-update/route');
  await hostReports();
  expect((await POST(request('POST', { action: 'change', version: '1.0.0' }))).status).toBe(422);
  expect((await POST(request('POST', { action: 'change', version: '1.0.0', reason: 'ฉลากพิมพ์ไม่ได้' }))).status).toBe(202);
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'system.rollback_requested', newValues: expect.objectContaining({ crossesSchemaChange: true }) });
});

test('refuses anything below the rollback floor even if the host lists it', async () => {
  const { POST } = await import('@/app/api/admin/system-update/route');
  await hostReports({ releases: [entry('1.1.0'), entry('1.0.0'), entry('0.9.0')] });
  const response = await POST(request('POST', { action: 'change', version: '0.9.0', reason: 'x' }));
  expect(response.status).toBe(422);
  expect((await response.json()).message).toMatch(/1\.0\.0 เท่านั้น/);
  await expect(readFile(path.join(folder, 'request.json'))).rejects.toThrow();
});

test('refuses to change versions while the host is silent or busy', async () => {
  const { POST } = await import('@/app/api/admin/system-update/route');
  await hostReports({ checkedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
  expect((await POST(request('POST', { action: 'change', version: '1.2.0', reason: 'x' }))).status).toBe(503);
  await hostReports({ job: { id: 'job-1', action: 'update', version: '1.2.0', from: '1.1.0', state: 'running', step: 'สำรองฐานข้อมูล' } });
  expect((await POST(request('POST', { action: 'change', version: '1.2.0', reason: 'x' }))).status).toBe(409);
});

test('a waiting request can be cancelled', async () => {
  const { POST, DELETE } = await import('@/app/api/admin/system-update/route');
  await hostReports();
  await POST(request('POST', { action: 'change', version: '1.2.0', reason: 'ทดสอบ' }));
  const body = await (await DELETE(request('DELETE'))).json();
  expect(body.pending).toBeNull();
  expect(createAudit.mock.calls.at(-1)?.[0].data).toMatchObject({ action: 'system.version_change_cancelled' });
});

test('says the updater is not installed when the folder is not configured', async () => {
  const { GET, POST } = await import('@/app/api/admin/system-update/route');
  vi.stubEnv('UPDATER_STATE_PATH', '');
  const body = await (await GET(request('GET'))).json();
  expect(body.updater.configured).toBe(false);
  expect(body.releases.map((release: { version: string }) => release.version)).toEqual(['1.1.0', '1.0.0']);
  expect((await POST(request('POST', { action: 'check' }))).status).toBe(503);
});
