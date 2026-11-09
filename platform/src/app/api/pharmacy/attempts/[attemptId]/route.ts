import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

// "ลบ" on the waiting-for-rider queue: removes the package that no rider has scanned yet, with its QR, so the old
// label no longer scans. The delivery job itself stays and goes back to "เตรียมพัสดุ" to be prepared again.
// The reason and a snapshot of the removed package go to the audit log.
export async function DELETE(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { attemptId } = await context.params;
    const body = await readJsonBody(request) as { reason?: unknown } | undefined;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return invalidInput('ต้องระบุเหตุผลการลบ');

    const removed = await db.$transaction(async (tx) => {
      const found = await tx.deliveryAttempt.findUnique({
        where: { id: attemptId },
        select: { id: true, deliveryRequestId: true, status: true, riderId: true, createdAt: true },
      });
      if (!found) throw new DomainError('ไม่พบพัสดุนี้', 404);
      // Locks the job so this cannot cross a pharmacist preparing or deleting it at the same moment.
      await tx.$queryRaw`SELECT id FROM delivery_requests WHERE id = ${found.deliveryRequestId} FOR UPDATE`;
      if (found.status !== 'prepared' || found.riderId !== null) throw new DomainError('ไรเดอร์รับงานนี้แล้ว ลบไม่ได้', 409);

      await tx.packageQrToken.deleteMany({ where: { deliveryAttemptId: attemptId } });
      // Only while still waiting: a rider scanning at this moment either claimed first (and this fails) or finds nothing.
      const deleted = await tx.deliveryAttempt.deleteMany({ where: { id: attemptId, status: 'prepared', riderId: null } });
      if (deleted.count !== 1) throw new DomainError('ไรเดอร์เพิ่งรับงานนี้ ลบไม่ได้', 409);
      await audit(tx, {
        // Logged on the job, so its history still shows the deletion once a new package is prepared.
        actorId: pharmacist.id, action: 'delivery_attempt.deleted', auditableType: 'DeliveryRequest', auditableId: found.deliveryRequestId, reason,
        oldValues: { deliveryAttemptId: attemptId, status: found.status, preparedAt: found.createdAt.toISOString() },
        newValues: { deliveryAttemptId: null, queue: 'prepare' },
      });
      return { attemptId, deliveryRequestId: found.deliveryRequestId };
    });
    return NextResponse.json({ ...removed, deleted: true });
  });
}
