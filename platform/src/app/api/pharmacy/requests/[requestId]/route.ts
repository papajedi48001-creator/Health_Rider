import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

// Pharmacy edits or deletes a job on its "เตรียมพัสดุ" and "รอไรเดอร์รับงาน" queues, before any rider has it.
// Once a rider claims the package, changes go through the in-transit amendment on the operations page instead.
// Every change asks for a reason and writes an audit event with the old and new values; the audit trail is never deleted.

type EditBody = { deliveryAddress?: unknown; telephone?: unknown; reason?: unknown; expectedVersion?: unknown };

const lockRequest = (tx: Pick<typeof db, '$queryRaw'>, id: string) => tx.$queryRaw`SELECT id FROM delivery_requests WHERE id = ${id} FOR UPDATE`;

// Editable while no package exists yet, after the medication came back, or while the package waits for a rider.
const editableLatest = new Set([undefined, 'returned', 'prepared']);

export async function PATCH(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { requestId } = await context.params;
    const body = await readJsonBody(request) as EditBody | undefined;
    if (!body || typeof body.reason !== 'string' || !Number.isInteger(body.expectedVersion)
      || typeof body.deliveryAddress !== 'string' || (body.telephone !== undefined && typeof body.telephone !== 'string')) {
      return invalidInput('ข้อมูลการแก้ไขไม่ถูกต้อง');
    }
    const reason = body.reason.trim();
    const deliveryAddress = body.deliveryAddress.trim();
    const telephone = typeof body.telephone === 'string' ? body.telephone.trim() || null : undefined;
    if (!reason) return invalidInput('ต้องระบุเหตุผลการแก้ไข');
    if (!deliveryAddress) return invalidInput('ต้องระบุที่อยู่จัดส่ง');

    const updated = await db.$transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const found = await tx.deliveryRequest.findUnique({
        where: { id: requestId },
        select: { id: true, deliveryVersion: true, deliveryAddress: true, telephone: true, attempts: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
      });
      if (!found) throw new DomainError('ไม่พบงานจัดส่งนี้', 404);
      if (!editableLatest.has(found.attempts[0]?.status)) throw new DomainError('ไรเดอร์รับงานนี้แล้ว แก้ไขได้จากหน้าภาพรวมการจัดส่ง', 409);
      if (found.deliveryVersion !== body.expectedVersion) throw new DomainError('ข้อมูลงานถูกแก้ไขโดยผู้อื่นแล้ว โปรดโหลดข้อมูลล่าสุดก่อนแก้ไข', 409);

      const oldValues: Record<string, unknown> = {};
      const newValues: Record<string, unknown> = {};
      if (deliveryAddress !== found.deliveryAddress) { oldValues.deliveryAddress = found.deliveryAddress; newValues.deliveryAddress = deliveryAddress; }
      if (telephone !== undefined && telephone !== found.telephone) { oldValues.telephone = found.telephone; newValues.telephone = telephone; }
      if (Object.keys(newValues).length === 0) throw new DomainError('ไม่มีข้อมูลที่เปลี่ยนแปลง');

      const deliveryVersion = found.deliveryVersion + 1;
      await tx.deliveryRequest.update({ where: { id: requestId }, data: { ...newValues, deliveryVersion } });
      await audit(tx, {
        actorId: pharmacist.id, action: 'delivery_request.amended_before_pickup', auditableType: 'DeliveryRequest', auditableId: requestId, reason,
        oldValues: { ...oldValues, deliveryVersion: found.deliveryVersion }, newValues: { ...newValues, deliveryVersion },
      });
      return { id: requestId, deliveryVersion, ...newValues };
    });
    return NextResponse.json(updated);
  });
}

// Deletes a job no rider has ever had: its waiting package and QR go with it, so the old label no longer scans,
// and the HOSxP visit returns to "รอยืนยันจาก HOSxP" in case it was deleted by mistake. A job with any delivery
// history (claimed, failed, returned) cannot be deleted, so its evidence and history stay.
export async function DELETE(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { requestId } = await context.params;
    const body = await readJsonBody(request) as { reason?: unknown } | undefined;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (!reason) return invalidInput('ต้องระบุเหตุผลการลบ');

    await db.$transaction(async (tx) => {
      await lockRequest(tx, requestId);
      const found = await tx.deliveryRequest.findUnique({
        where: { id: requestId },
        select: {
          id: true, hosVisitNumber: true, hn: true, patientName: true, telephone: true, deliveryAddress: true, deliveryZoneId: true, createdAt: true,
          attempts: { select: { id: true, status: true, riderId: true } },
        },
      });
      if (!found) throw new DomainError('ไม่พบงานจัดส่งนี้', 404);
      if (found.attempts.some((attempt) => attempt.status !== 'prepared' || attempt.riderId !== null)) {
        throw new DomainError('งานนี้มีประวัติการจัดส่งแล้ว ลบไม่ได้', 409);
      }
      const attemptIds = found.attempts.map((attempt) => attempt.id);
      if (attemptIds.length > 0) {
        await tx.packageQrToken.deleteMany({ where: { deliveryAttemptId: { in: attemptIds } } });
        // Only packages still waiting: a rider scanning at this moment either claimed first (and this fails) or finds nothing.
        const removed = await tx.deliveryAttempt.deleteMany({ where: { id: { in: attemptIds }, status: 'prepared', riderId: null } });
        if (removed.count !== attemptIds.length) throw new DomainError('ไรเดอร์เพิ่งรับงานนี้ ลบไม่ได้', 409);
      }
      await tx.deliveryRequest.delete({ where: { id: requestId } });
      const { attempts, ...snapshot } = found;
      await audit(tx, {
        actorId: pharmacist.id, action: 'delivery_request.deleted', auditableType: 'DeliveryRequest', auditableId: requestId, reason,
        oldValues: { ...snapshot, createdAt: snapshot.createdAt.toISOString(), deletedPackageIds: attempts.map((attempt) => attempt.id) },
      });
    });
    return NextResponse.json({ id: requestId, deleted: true });
  });
}
