import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { updateUser, createAudit, currentSession } = vi.hoisted(() => ({ updateUser: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn() }));
const tx = { user: { update: updateUser }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) } }));

const userId = '01JTESTUSER0000000000000AA';
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`;
let storage: string;

function request(method: string, body?: unknown) {
  return new NextRequest('http://localhost/api/me/avatar', { method, body: body === undefined ? undefined : JSON.stringify(body) });
}
async function fetchAvatar(id: string) {
  const { GET } = await import('@/app/api/users/[userId]/avatar/route');
  return GET(new NextRequest(`http://localhost/api/users/${id}/avatar`), { params: Promise.resolve({ userId: id }) });
}

beforeEach(async () => {
  vi.clearAllMocks();
  storage = await mkdtemp(path.join(tmpdir(), 'avatar-'));
  vi.stubEnv('EVIDENCE_STORAGE_PATH', storage);
  currentSession.mockResolvedValue({ id: userId, role: 'rider', displayName: 'ไรเดอร์' });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(storage, { recursive: true, force: true });
});

test('a user uploads a profile photo that any signed-in user can then load', async () => {
  const { PUT } = await import('@/app/api/me/avatar/route');

  const response = await PUT(request('PUT', { photo: jpeg }));

  expect(response.status).toBe(200);
  expect((await response.json()).avatarVersion).toEqual(expect.any(Number));
  expect(updateUser).toHaveBeenCalledWith({ where: { id: userId }, data: { avatarUpdatedAt: expect.any(Date) } });
  expect(createAudit.mock.calls[0]?.[0].data.action).toBe('user.avatar_updated');

  currentSession.mockResolvedValue({ id: 'someone-else', role: 'pharmacy', displayName: 'เภสัช' });
  const photo = await fetchAvatar(userId);
  expect(photo.status).toBe(200);
  expect(photo.headers.get('content-type')).toBe('image/jpeg');
  expect(Buffer.from(await photo.arrayBuffer())[0]).toBe(0xff);
});

test('rejects files that are not JPEG or are too large', async () => {
  const { PUT } = await import('@/app/api/me/avatar/route');

  expect((await PUT(request('PUT', { photo: Buffer.from('<svg/>').toString('base64') }))).status).toBe(422);
  expect((await PUT(request('PUT', { photo: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(400 * 1024)]).toString('base64') }))).status).toBe(422);
  expect((await PUT(request('PUT', {}))).status).toBe(422);
  expect(updateUser).not.toHaveBeenCalled();
});

test('removing the photo clears it, and unknown or malformed ids find nothing', async () => {
  const { PUT, DELETE } = await import('@/app/api/me/avatar/route');
  await PUT(request('PUT', { photo: jpeg }));

  expect((await DELETE(request('DELETE'))).status).toBe(200);
  expect(updateUser).toHaveBeenLastCalledWith({ where: { id: userId }, data: { avatarUpdatedAt: null } });
  expect((await fetchAvatar(userId)).status).toBe(404);
  expect((await fetchAvatar('../../etc')).status).toBe(404);
});

test('signed-out visitors cannot load profile photos', async () => {
  currentSession.mockResolvedValue(null);
  expect((await fetchAvatar(userId)).status).toBe(401);
});
