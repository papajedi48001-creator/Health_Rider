import { expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
const { findMany } = vi.hoisted(() => ({ findMany: vi.fn().mockResolvedValue([]) }));
const { currentSession } = vi.hoisted(() => ({ currentSession: vi.fn() }));
vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({ db: { deliveryAttempt: { findMany } } }));
test('dashboard applies an allowed status filter for coordinator', async () => { const { GET } = await import('@/app/api/operations/dashboard/route'); currentSession.mockResolvedValue({ id: 'c1', role: 'coordinator', displayName: 'C' }); const response = await GET(new NextRequest('http://localhost/api/operations/dashboard?status=delivered')); expect(response.status).toBe(200); expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'delivered' } })); });
