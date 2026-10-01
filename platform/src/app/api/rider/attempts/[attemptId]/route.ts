import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/session';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { db } from '@/lib/db';
import { toRiderAttemptView } from '@/domain/delivery/rider-attempt-access';

export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  try {
    const session = requireRole(getSessionFromRequest(request), 'rider', 'coordinator', 'admin');
    const { attemptId } = await context.params;
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
          },
        },
      },
    });

    if (!attempt || (session.role === 'rider' && attempt.riderId !== session.id)) {
      return NextResponse.json({ message: 'ไม่พบงานจัดส่ง' }, { status: 404 });
    }

    return NextResponse.json(toRiderAttemptView(attempt));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }

    throw error;
  }
}
