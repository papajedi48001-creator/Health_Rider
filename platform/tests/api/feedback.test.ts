import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { currentSession, createFeedback, findFeedback, findAttempt, updateFeedback, createAudit } = vi.hoisted(() => ({
  currentSession: vi.fn(), createFeedback: vi.fn(), findFeedback: vi.fn(), findAttempt: vi.fn(), updateFeedback: vi.fn(), createAudit: vi.fn(),
}));
const tx = { feedback: { findUnique: findFeedback, update: updateFeedback }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: {
    feedback: { create: createFeedback, findUnique: findFeedback },
    deliveryAttempt: { findUnique: findAttempt },
    $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx),
  },
}));

const riderId = '01JTESTRIDER00000000000000';
const attemptId = '01JTESTATTEMPT0000000000AA';
const feedbackId = '01JTESTFEEDBACK000000000AA';
const jpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64')}`;
let storage: string;

const post = (body: unknown) => new NextRequest('http://localhost/api/feedback', { method: 'POST', body: JSON.stringify(body) });

beforeEach(async () => {
  vi.clearAllMocks();
  storage = await mkdtemp(path.join(tmpdir(), 'feedback-'));
  vi.stubEnv('EVIDENCE_STORAGE_PATH', storage);
  currentSession.mockResolvedValue({ id: 'pharmacist', role: 'pharmacy', displayName: 'เภสัช' });
  findFeedback.mockResolvedValue(null);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(storage, { recursive: true, force: true });
});

test('a pharmacist sends a problem with a screenshot and the page it came from', async () => {
  const { POST } = await import('@/app/api/feedback/route');

  const response = await POST(post({ kind: 'problem', message: 'ฉลากตัดชื่อ', pagePath: '/pharmacy/packages', userAgent: 'Chrome/131', photo: jpeg }));

  expect(response.status).toBe(201);
  const data = createFeedback.mock.calls[0]?.[0].data;
  expect(data).toMatchObject({ userId: 'pharmacist', role: 'pharmacy', kind: 'problem', message: 'ฉลากตัดชื่อ', pagePath: '/pharmacy/packages', hasPhoto: true, status: 'new' });
  expect(await readdir(path.join(storage, 'feedback'))).toEqual([`${data.id}.jpg`]);
});

test('a screenshot that is not a JPEG is refused before anything is saved', async () => {
  const { POST } = await import('@/app/api/feedback/route');
  const response = await POST(post({ kind: 'problem', message: 'x', photo: Buffer.from('<svg/>').toString('base64') }));
  expect(response.status).toBe(422);
  expect(createFeedback).not.toHaveBeenCalled();
});

test('a rider rates their own finished delivery once', async () => {
  const { POST } = await import('@/app/api/feedback/route');
  currentSession.mockResolvedValue({ id: riderId, role: 'rider', displayName: 'ไรเดอร์' });
  findAttempt.mockResolvedValue({ riderId, status: 'delivered' });

  expect((await POST(post({ kind: 'rating', attemptId, rating: 5 }))).status).toBe(201);
  expect(createFeedback.mock.calls[0]?.[0].data).toMatchObject({ kind: 'rating', rating: 5, deliveryAttemptId: attemptId, status: 'resolved', tags: null });

  findFeedback.mockResolvedValue({ id: feedbackId });
  expect((await POST(post({ kind: 'rating', attemptId, rating: 2, tags: ['no_answer'] }))).status).toBe(409);
});

test('a rating is refused for someone else’s delivery, an unfinished one, or from staff', async () => {
  const { POST } = await import('@/app/api/feedback/route');
  expect((await POST(post({ kind: 'rating', attemptId, rating: 4 }))).status).toBe(422);

  currentSession.mockResolvedValue({ id: riderId, role: 'rider', displayName: 'ไรเดอร์' });
  findAttempt.mockResolvedValue({ riderId: 'another-rider', status: 'delivered' });
  expect((await POST(post({ kind: 'rating', attemptId, rating: 4 }))).status).toBe(404);
  findAttempt.mockResolvedValue({ riderId, status: 'in_transit' });
  expect((await POST(post({ kind: 'rating', attemptId, rating: 4 }))).status).toBe(422);
  expect(createFeedback).not.toHaveBeenCalled();
});

test('signed-out visitors cannot send feedback', async () => {
  const { POST } = await import('@/app/api/feedback/route');
  currentSession.mockResolvedValue(null);
  expect((await POST(post({ kind: 'praise', message: 'ดี' }))).status).toBe(401);
});

test('only an admin answers feedback, and the answer is audited', async () => {
  const { PATCH } = await import('@/app/api/admin/feedback/[feedbackId]/route');
  const patch = (body: unknown) => PATCH(
    new NextRequest(`http://localhost/api/admin/feedback/${feedbackId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ feedbackId }) },
  );
  expect((await patch({ status: 'resolved' })).status).toBe(403);

  currentSession.mockResolvedValue({ id: 'admin', role: 'admin', displayName: 'แอดมิน' });
  findFeedback.mockResolvedValue({ status: 'new', reply: null });
  updateFeedback.mockImplementation(({ data }) => Promise.resolve({ id: feedbackId, status: data.status, reply: data.reply, repliedAt: data.repliedAt }));

  const response = await patch({ status: 'in_progress', reply: 'กำลังแก้ครับ' });

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'in_progress', reply: 'กำลังแก้ครับ', repliedByName: 'แอดมิน' });
  expect(updateFeedback.mock.calls[0]?.[0].data).toMatchObject({ status: 'in_progress', reply: 'กำลังแก้ครับ', repliedById: 'admin', repliedAt: expect.any(Date) });
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'feedback.updated', auditableId: feedbackId });

  findFeedback.mockResolvedValue(null);
  expect((await patch({ status: 'resolved' })).status).toBe(404);
});
