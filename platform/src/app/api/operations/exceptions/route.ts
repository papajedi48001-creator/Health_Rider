import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const viewer = requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const [returns, conflicts] = await Promise.all([
      db.deliveryAttempt.findMany({
        where: { status: 'return_required' },
        orderBy: { failedAt: 'asc' },
        select: { id: true, failedAt: true, failureReason: true, rider: { select: { id: true, displayName: true, avatarUpdatedAt: true } }, deliveryRequest: { select: { hn: true, patientName: true } } },
      }),
      db.syncConflict.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, reason: true, previousStatus: true, createdAt: true, deliveryAttemptId: true,
          offlineDeliveryEvent: { select: { id: true, eventType: true, deliveryVersion: true, deviceCapturedAt: true, serverReceivedAt: true, payload: true } },
          deliveryAttempt: { select: { rider: { select: { id: true, displayName: true, avatarUpdatedAt: true } }, deliveryRequest: { select: { hn: true, patientName: true, deliveryAddress: true, telephone: true, deliveryVersion: true } } } },
        },
      }),
    ]);
    // The GPS position recorded with a delivery photo is for admins only.
    const shown = viewer.role === 'admin' ? conflicts : conflicts.map((conflict) => {
      const { location: _location, ...payload } = (conflict.offlineDeliveryEvent.payload ?? {}) as Record<string, unknown>;
      return { ...conflict, offlineDeliveryEvent: { ...conflict.offlineDeliveryEvent, payload } };
    });
    return NextResponse.json({ returns, conflicts: shown });
  });
}
