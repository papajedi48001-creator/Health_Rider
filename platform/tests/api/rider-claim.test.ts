import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/auth/session';

const { transaction, auditCreate } = vi.hoisted(() => ({ transaction: vi.fn(), auditCreate: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: transaction,
    packageQrToken: { findUnique: vi.fn(), updateMany: vi.fn() },
    deliveryAttempt: { updateMany: vi.fn() },
    auditEvent: { create: auditCreate },
  },
}));

test('does not let a pharmacy user claim a package QR', async () => {
  const { POST } = await import('@/app/api/rider/claims/route');
  process.env.AUTH_SECRET = 'test-session-secret';
  const token = createSessionToken({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, 'test-session-secret');
  const response = await POST(new NextRequest('http://localhost/api/rider/claims', {
    method: 'POST',
    headers: { cookie: `health_rider_session=${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'opaque-token' }),
  }));

  expect(response.status).toBe(403);
  expect(transaction).not.toHaveBeenCalled();
});
