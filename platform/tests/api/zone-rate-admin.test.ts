import { expect, test, vi } from 'vitest';
import { createSessionToken } from '@/auth/session';
import { NextRequest } from 'next/server';

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    zoneRate: { findMany: vi.fn().mockResolvedValue([]), create },
  },
}));

test('rejects a rider creating a zone rate', async () => {
  const { POST } = await import('@/app/api/admin/zone-rates/route');
  process.env.AUTH_SECRET = 'test-session-secret';
  const token = createSessionToken(
    { id: '01J00000000000000000000011', role: 'rider', displayName: 'ไรเดอร์ทดสอบ' },
    'test-session-secret',
  );
  const request = new NextRequest('http://localhost/api/admin/zone-rates', {
    method: 'POST',
    headers: { cookie: `health_rider_session=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      id: '01J00000000000000000000101',
      deliveryZoneId: '01J00000000000000000000099',
      satang: 2500,
      effectiveFrom: '2026-10-01',
    }),
  });

  const response = await POST(request);

  expect(response.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
});
