import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { transaction, auditCreate } = vi.hoisted(() => ({ transaction: vi.fn(), auditCreate: vi.fn() }));

const { currentSession } = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
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
  currentSession.mockResolvedValue({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' });
  const response = await POST(new NextRequest('http://localhost/api/rider/claims', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'opaque-token' }),
  }));

  expect(response.status).toBe(403);
  expect(transaction).not.toHaveBeenCalled();
});
