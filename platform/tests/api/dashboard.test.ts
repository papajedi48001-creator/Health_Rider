import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createSessionToken } from '@/auth/session';
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]) }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany } } }));
test('dashboard applies an allowed status filter for coordinator', async () => { const { GET } = await import('@/app/api/operations/dashboard/route'); process.env.AUTH_SECRET = 'test-session-secret'; const token = createSessionToken({ id: 'c1', role: 'coordinator', displayName: 'C' }, 'test-session-secret'); const response = await GET(new NextRequest('http://localhost/api/operations/dashboard?status=delivered', { headers: { cookie: `health_rider_session=${token}` } })); expect(response.status).toBe(200); expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'delivered' } })); });
