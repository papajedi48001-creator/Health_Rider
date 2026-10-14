import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The signed-in rider's own unfinished attempts; patient data is limited to the Rider Delivery View.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const attempts = await db.deliveryAttempt.findMany({
      where: { riderId: rider.id, status: { in: ['claimed', 'in_transit', 'sync_review', 'return_required'] } },
      orderBy: { claimedAt: 'asc' },
      select: { id: true, status: true, deliveryRequest: { select: { patientName: true, deliveryAddress: true } } },
    });
    return NextResponse.json({
      attempts: attempts.map((attempt) => ({
        id: attempt.id, status: attempt.status, patientName: attempt.deliveryRequest.patientName, address: attempt.deliveryRequest.deliveryAddress,
      })),
    });
  });
}
