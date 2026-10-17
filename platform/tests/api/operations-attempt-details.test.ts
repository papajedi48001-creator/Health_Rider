import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { findAttempt, findEvents, findUsers, currentSession } = vi.hoisted(() => ({
  findAttempt: vi.fn(), findEvents: vi.fn(), findUsers: vi.fn(), currentSession: vi.fn(),
}));

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: { deliveryAttempt: { findUnique: findAttempt }, auditEvent: { findMany: findEvents }, user: { findMany: findUsers } },
}));

const attempt = {
  id: 'ATTEMPT2', status: 'delivered', createdAt: '2026-10-16T05:00:00.000Z',
  evidence: { recipientRelation: 'self', deviceCapturedAt: '2026-10-16T07:30:00.000Z', serverReceivedAt: '2026-10-16T07:32:00.000Z', latitude: 17.2501, longitude: 103.9502, locationAccuracyM: 12 },
  deliveryRequest: {
    id: 'REQUEST1', hn: '470032520', patientName: 'ไพวรรณ ผิวบุญเรือง',
    attempts: [
      { id: 'ATTEMPT1', status: 'returned', createdAt: '2026-10-15T05:00:00.000Z' },
      { id: 'ATTEMPT2', status: 'delivered', createdAt: '2026-10-16T05:00:00.000Z' },
    ],
  },
};

function get(id: string) {
  return import('@/app/api/operations/attempts/[attemptId]/route').then(({ GET }) =>
    GET(new NextRequest(`http://localhost/api/operations/attempts/${id}`), { params: Promise.resolve({ attemptId: id }) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSession.mockResolvedValue({ id: 'coord-1', role: 'coordinator', displayName: 'ผู้ประสานงาน' });
  findAttempt.mockResolvedValue(attempt);
  findEvents.mockResolvedValue([
    { id: 'E1', actorId: 'pharm-1', action: 'delivery_request.created_from_hos_candidate', reason: null, createdAt: '2026-10-15T04:00:00.000Z' },
    { id: 'E2', actorId: 'rider-1', action: 'delivery_attempt.claimed', reason: null, createdAt: '2026-10-16T06:00:00.000Z' },
  ]);
  findUsers.mockResolvedValue([{ id: 'pharm-1', displayName: 'เภสัช' }, { id: 'rider-1', displayName: 'น้องภูไทไรเดอร์' }]);
});

test('returns the delivery with its proof, earlier attempts and named history', async () => {
  const response = await get('ATTEMPT2');

  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ id: 'ATTEMPT2', attemptNumber: 2, evidence: { recipientRelation: 'self' } });
  expect(body.deliveryRequest).not.toHaveProperty('attempts');
  expect(body.otherAttempts).toEqual([{ id: 'ATTEMPT1', status: 'returned', createdAt: '2026-10-15T05:00:00.000Z' }]);
  expect(body.history.map((event: { actorName: string }) => event.actorName)).toEqual(['เภสัช', 'น้องภูไทไรเดอร์']);
  expect(body.history[0]).not.toHaveProperty('actorId');
  expect(findEvents).toHaveBeenCalledWith(expect.objectContaining({ where: { auditableId: { in: ['ATTEMPT2', 'REQUEST1'] } } }));
});

test('answers 404 for an unknown delivery', async () => {
  findAttempt.mockResolvedValue(null);
  expect((await get('NOPE')).status).toBe(404);
});

test('only pharmacy, coordinators and admins can open delivery details', async () => {
  for (const role of ['rider', 'auditor']) {
    currentSession.mockResolvedValue({ id: `${role}-1`, role, displayName: role });
    expect((await get('ATTEMPT2')).status).toBe(403);
  }
  expect(findAttempt).not.toHaveBeenCalled();
});

test('shows the GPS position of the delivery photo to admins only', async () => {
  const forCoordinator = await (await get('ATTEMPT2')).json();
  expect(forCoordinator.evidence).not.toHaveProperty('latitude');
  expect(forCoordinator.evidence).not.toHaveProperty('longitude');

  currentSession.mockResolvedValue({ id: 'admin-1', role: 'admin', displayName: 'แอดมิน' });
  const forAdmin = await (await get('ATTEMPT2')).json();
  expect(forAdmin.evidence).toMatchObject({ latitude: 17.2501, longitude: 103.9502, locationAccuracyM: 12 });
});
