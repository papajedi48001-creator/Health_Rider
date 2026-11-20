import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Whether the rider still needs to be asked how this delivery went: only their own finished delivery, and only once.
export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), 'rider', 'admin');
    const { attemptId } = await context.params;
    if (session.role !== 'rider') return NextResponse.json({ ask: false });
    const [attempt, rating] = await Promise.all([
      db.deliveryAttempt.findUnique({ where: { id: attemptId }, select: { riderId: true, status: true } }),
      db.feedback.findUnique({ where: { deliveryAttemptId: attemptId }, select: { id: true } }),
    ]);
    const ask = attempt?.riderId === session.id && attempt.status === 'delivered' && !rating;
    return NextResponse.json({ ask }, { headers: { 'cache-control': 'no-store' } });
  });
}
