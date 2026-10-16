import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Everything about one delivery for the details pop-up: patient, timeline, proof of delivery, other attempts and history.
export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const { attemptId } = await context.params;
    const attempt = await db.deliveryAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true, status: true, createdAt: true, claimedAt: true, pickedUpAt: true, deliveredAt: true, failedAt: true, failureReason: true, returnedAt: true,
        rider: { select: { id: true, displayName: true, avatarUpdatedAt: true, phone: true, riderProfile: { select: { riderCode: true } } } },
        evidence: { select: { recipientRelation: true, deviceCapturedAt: true, serverReceivedAt: true } },
        deliveryRequest: {
          select: {
            id: true, hosVisitNumber: true, hn: true, patientName: true, patientAge: true, telephone: true, deliveryAddress: true,
            deliveryVersion: true, rateSatang: true, createdAt: true,
            createdBy: { select: { displayName: true } },
            deliveryZone: { select: { displayName: true } },
            attempts: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, createdAt: true } },
          },
        },
      },
    });
    if (!attempt) return NextResponse.json({ message: 'ไม่พบงานส่งนี้' }, { status: 404 });

    const events = await db.auditEvent.findMany({
      where: { auditableId: { in: [attempt.id, attempt.deliveryRequest.id] } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, actorId: true, action: true, reason: true, createdAt: true },
    });
    const actors = await db.user.findMany({ where: { id: { in: [...new Set(events.map((event) => event.actorId))] } }, select: { id: true, displayName: true } });
    const actorName = new Map(actors.map((actor) => [actor.id, actor.displayName]));

    const { attempts, ...deliveryRequest } = attempt.deliveryRequest;
    return NextResponse.json({
      ...attempt,
      deliveryRequest,
      attemptNumber: attempts.findIndex((item) => item.id === attempt.id) + 1,
      otherAttempts: attempts.filter((item) => item.id !== attempt.id),
      history: events.map(({ actorId, ...event }) => ({ ...event, actorName: actorName.get(actorId) ?? null })),
    });
  });
}
