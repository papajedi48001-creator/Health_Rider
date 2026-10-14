import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findFirst, currentSession, readEvidencePhoto } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  currentSession: vi.fn(),
  readEvidencePhoto: vi.fn(),
}));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findFirst } } }));
vi.mock('@/evidence/photo-storage', () => ({ readEvidencePhoto }));

const attemptId = '01J00000000000000000000020';
const photoRequest = () => new NextRequest(`http://localhost/api/rider/history/${attemptId}/photo`);
const params = { params: Promise.resolve({ attemptId }) };
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  readEvidencePhoto.mockResolvedValue(jpeg);
});

test('returns the evidence photo of the signed-in rider’s own attempt, never cached', async () => {
  findFirst.mockResolvedValue({ evidence: { photoPath: `${attemptId}/event.jpg` } });
  const { GET } = await import('@/app/api/rider/history/[attemptId]/photo/route');
  const response = await GET(photoRequest(), params);

  expect(response.status).toBe(200);
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: attemptId, riderId: 'rider-1' } }));
  expect(readEvidencePhoto).toHaveBeenCalledWith(`${attemptId}/event.jpg`);
  expect(response.headers.get('content-type')).toBe('image/jpeg');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(Buffer.from(await response.arrayBuffer())).toEqual(jpeg);
});

test('answers 404 for another rider’s attempt or an attempt without a photo', async () => {
  const { GET } = await import('@/app/api/rider/history/[attemptId]/photo/route');
  findFirst.mockResolvedValueOnce(null);
  expect((await GET(photoRequest(), params)).status).toBe(404);
  findFirst.mockResolvedValueOnce({ evidence: null });
  expect((await GET(photoRequest(), params)).status).toBe(404);
  expect(readEvidencePhoto).not.toHaveBeenCalled();
});

test('refuses other roles', async () => {
  const { GET } = await import('@/app/api/rider/history/[attemptId]/photo/route');
  currentSession.mockResolvedValueOnce({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
  expect((await GET(photoRequest(), params)).status).toBe(403);
  expect(findFirst).not.toHaveBeenCalled();
});
