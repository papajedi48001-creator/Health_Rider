import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireAttemptInScope } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { toRiderAttemptView } from '@/domain/delivery/rider-attempt-access';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), 'rider', 'pharmacy', 'coordinator', 'admin');
    const { attemptId } = await context.params;
    await requireAttemptInScope(db, session, { id: attemptId }, 'ไม่พบงานจัดส่ง');
    const attempt = await db.deliveryAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        riderId: true,
        status: true,
        deliveryRequest: {
          select: {
            hn: true,
            patientName: true,
            patientAge: true,
            telephone: true,
            deliveryAddress: true,
            deliveryVersion: true,
          },
        },
      },
    });

    if (!attempt || (session.role === 'rider' && attempt.riderId !== session.id)) {
      return NextResponse.json({ message: 'ไม่พบงานจัดส่ง' }, { status: 404 });
    }

    return NextResponse.json(toRiderAttemptView(attempt), { headers: { 'cache-control': 'no-store' } });
  });
}
