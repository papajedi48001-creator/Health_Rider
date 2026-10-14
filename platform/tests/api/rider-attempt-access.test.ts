import { beforeEach, expect, test, vi } from 'vitest';
import { canViewRiderAttempt, toRiderAttemptView } from '@/domain/delivery/rider-attempt-access';
import { NextRequest } from 'next/server';

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

const { currentSession } = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: { deliveryAttempt: { findUnique } },
}));

const attempt = {
  id: '01J00000000000000000000010',
  riderId: '01J00000000000000000000011',
  status: 'claimed',
  deliveryRequest: {
    hn: 'HN-TEST-001',
    patientName: 'ผู้ป่วยทดสอบ',
    patientAge: 64,
    telephone: '0800000000',
    deliveryAddress: 'บ้านทดสอบ หมู่ 1',
    deliveryVersion: 2,
    medicineName: 'must-not-be-exposed',
  },
};

const reader = {
  findById: async () => attempt,
};

beforeEach(() => {
  findUnique.mockResolvedValue(attempt);
});

test('denies a rider who did not claim the attempt', async () => {
  await expect(canViewRiderAttempt('01J00000000000000000000012', attempt.id, reader)).resolves.toBe(false);
});

test('allows the rider who claimed the attempt', async () => {
  await expect(canViewRiderAttempt(attempt.riderId, attempt.id, reader)).resolves.toBe(true);
});

test('projects only the permitted patient identity fields', () => {
  expect(toRiderAttemptView(attempt)).toEqual({
    id: '01J00000000000000000000010',
    status: 'claimed',
    deliveryVersion: 2,
    patient: {
      hn: 'HN-TEST-001',
      name: 'ผู้ป่วยทดสอบ',
      age: 64,
      telephone: '0800000000',
      address: 'บ้านทดสอบ หมู่ 1',
    },
  });
});

test('returns no patient data to a rider who did not claim the attempt', async () => {
  const { GET } = await import('@/app/api/rider/attempts/[attemptId]/route');
  currentSession.mockResolvedValue({ id: '01J00000000000000000000012', role: 'rider', displayName: 'ไรเดอร์คนอื่น' });
  const response = await GET(
    new NextRequest('http://localhost/api/rider/attempts/01J00000000000000000000010'),
    { params: Promise.resolve({ attemptId: attempt.id }) },
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ message: 'ไม่พบงานจัดส่ง' });
});
