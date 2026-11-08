import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireAttemptInScope } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { receiveMedicationReturn } from '@/domain/delivery/receive-medication-return';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    // Pharmacy confirms from its return queue; the coordinator can confirm from the exceptions page when the rider hands the medication back there.
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const { attemptId } = await context.params;
    await requireAttemptInScope(db, pharmacist, { id: attemptId });
    const returned = await db.$transaction(async (tx) => {
      await receiveMedicationReturn(attemptId, pharmacist, {
        findReturnRequiredAttempt: (id) => tx.deliveryAttempt.findUnique({ where: { id }, select: { id: true, status: true, failedAt: true } }),
        update: async (record) => {
          const updated = await tx.deliveryAttempt.updateMany({ where: { id: record.id, status: 'return_required' }, data: { status: record.status, returnedAt: record.returnedAt } });
          if (updated.count !== 1) throw new DomainError('งานนี้ถูกยืนยันรับยาคืนไปแล้ว', 409);
        },
      });
      await audit(tx, {
        actorId: pharmacist.id, action: 'delivery_attempt.medication_returned', auditableType: 'DeliveryAttempt', auditableId: attemptId,
        oldValues: { status: 'return_required' }, newValues: { status: 'returned' },
      });
      return { attemptId, status: 'returned' };
    });
    return NextResponse.json(returned);
  });
}
