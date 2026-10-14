import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { create, findUnique } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
}));

const { currentSession } = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: {
    deliveryZone: { findUnique },
    deliveryRequest: { create },
    auditEvent: { create: vi.fn() },
  },
}));

test('rejects a rider confirming a HOS candidate', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });
  const response = await POST(new NextRequest('http://localhost/api/pharmacy/candidates/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  }));

  expect(response.status).toBe(403);
  expect(create).not.toHaveBeenCalled();
});

test('allows pharmacy to create a delivery-zone request without monetary data', async () => {
  const { POST } = await import('@/app/api/pharmacy/candidates/confirm/route');
  findUnique.mockResolvedValue({ id: 'zone-1' });
  create.mockImplementation(async ({ data }) => data);
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });

  const response = await POST(new NextRequest('http://localhost/api/pharmacy/candidates/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      visitNumber: 'VN-TEST-001', hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
      telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '46', villageCode: '01',
    }),
  }));

  expect(response.status).toBe(201);
  const body = await response.json();
  expect(body).toEqual(expect.objectContaining({ hn: 'HN-TEST-001', deliveryZoneId: 'zone-1', createdById: 'pharmacy-1' }));
  expect(body).not.toHaveProperty('rateSatangSnapshot');
  expect(body).not.toHaveProperty('rateEffectiveOn');
});
