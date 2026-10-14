import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { prepareAttempt } from '@/domain/delivery/prepare-attempt';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import { newPublicId } from '@/domain/delivery/status';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const body = await readJsonBody(request) as { deliveryRequestId?: unknown } | undefined;
    if (!body || typeof body.deliveryRequestId !== 'string') {
      return NextResponse.json({ message: 'ไม่พบงานจัดส่งที่ต้องเตรียม' }, { status: 422 });
    }
    const deliveryRequestId = body.deliveryRequestId;

    const prepared = await db.$transaction(async (tx) => {
      const attempt = await prepareAttempt(deliveryRequestId, pharmacist, {
        createAttempt: (record) => tx.deliveryAttempt.create({ data: record }),
      });
      const token = await issuePackageQr(attempt.id, new Date(Date.now() + 24 * 60 * 60 * 1000), {
        create: async (record) => { await tx.packageQrToken.create({ data: record }); },
      });
      return { attempt, token };
    });

    await writeAuditEvent(db.auditEvent, {
      id: newPublicId(), actorId: pharmacist.id, action: 'delivery_attempt.prepared',
      auditableType: 'DeliveryAttempt', auditableId: prepared.attempt.id,
      reason: null, oldValues: null, newValues: { deliveryRequestId: prepared.attempt.deliveryRequestId },
    });
    return NextResponse.json({ attemptId: prepared.attempt.id, token: prepared.token }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    throw error;
  }
}
