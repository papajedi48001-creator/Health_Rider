import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findUnique, readPhoto, currentSession } = vi.hoisted(() => ({ findUnique: vi.fn(), readPhoto: vi.fn(), currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/evidence/photo-storage', () => ({ readEvidencePhoto: readPhoto }));
vi.mock('@/lib/db', () => ({ db: { deliveryEvidence: { findUnique } } }));

const photo = () => new NextRequest('http://localhost/api/rider/attempts/A1/evidence');
const params = { params: Promise.resolve({ attemptId: 'A1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ photoPath: 'A1/event.jpg', deliveryAttempt: { riderId: 'rider-1' } });
  readPhoto.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});

test('shows the delivering rider their evidence photo without caching it', async () => {
  const { GET } = await import('@/app/api/rider/attempts/[attemptId]/evidence/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });

  const response = await GET(photo(), params);

  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/jpeg');
  expect(response.headers.get('cache-control')).toContain('no-store');
  expect(readPhoto).toHaveBeenCalledWith('A1/event.jpg');
});

test('hides another rider’s photo and refuses auditors', async () => {
  const { GET } = await import('@/app/api/rider/attempts/[attemptId]/evidence/route');
  currentSession.mockResolvedValueOnce({ id: 'rider-2', role: 'rider', displayName: 'ไรเดอร์อื่น' });
  expect((await GET(photo(), params)).status).toBe(404);
  currentSession.mockResolvedValueOnce({ id: 'auditor-1', role: 'auditor', displayName: 'ผู้ตรวจสอบ' });
  expect((await GET(photo(), params)).status).toBe(403);
  expect(readPhoto).not.toHaveBeenCalled();
});
