import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { cancelDeliveryRequest } from '@/domain/delivery/cancel-delivery-request';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

// Cancels a job on "เตรียมพัสดุ" that cannot be deleted because it already has delivery history
// (a rider took it, it failed, and the medication came back). The job and its history stay; it just leaves the queue.
export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { requestId } = await context.params;
    const body = await readJsonBody(request) as { reason?: unknown } | undefined;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return invalidInput('ต้องระบุเหตุผลการยกเลิก');

    const cancelled = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM delivery_requests WHERE id = ${requestId} FOR UPDATE`;
      const result = await cancelDeliveryRequest(requestId, pharmacist, {
        findRequest: async (id) => {
          const found = await tx.deliveryRequest.findUnique({
            where: { id },
            select: { id: true, cancelledAt: true, attempts: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
          });
          return found && { id: found.id, cancelledAt: found.cancelledAt, latestAttemptStatus: found.attempts[0]?.status ?? null };
        },
        markCancelled: async (id, at) => {
          const updated = await tx.deliveryRequest.updateMany({ where: { id, cancelledAt: null }, data: { cancelledAt: at } });
          if (updated.count !== 1) throw new Error('cancel race');
        },
      });
      await audit(tx, {
        actorId: pharmacist.id, action: 'delivery_request.cancelled', auditableType: 'DeliveryRequest', auditableId: requestId, reason,
        oldValues: { latestAttemptStatus: result.latestAttemptStatus }, newValues: { cancelledAt: result.cancelledAt.toISOString() },
      });
      return { id: requestId, cancelled: true };
    });
    return NextResponse.json(cancelled);
  });
}
