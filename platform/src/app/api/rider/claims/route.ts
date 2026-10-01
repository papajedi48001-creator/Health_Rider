import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/session';
import { claimPackageQr } from '@/domain/delivery/claim-package-qr';
import { newPublicId } from '@/domain/delivery/status';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';
import { db } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const rider = requireRole(getSessionFromRequest(request), 'rider');
    const body = await request.json();
    if (!body || typeof body.token !== 'string' || body.token.length < 20) {
      return NextResponse.json({ message: 'รหัส QR ไม่ถูกต้อง' }, { status: 422 });
    }

    const result = await db.$transaction((tx) => claimPackageQr(body.token, rider.id, new Date(), {
      transaction: (work) => work({
        findToken: (tokenHash) => tx.packageQrToken.findUnique({
          where: { tokenHash },
          select: { deliveryAttemptId: true, expiresAt: true, invalidatedAt: true },
        }).then((record) => record && ({ attemptId: record.deliveryAttemptId, expiresAt: record.expiresAt, invalidatedAt: record.invalidatedAt })),
        claimPreparedAttempt: async (attemptId, riderId, claimedAt) => (await tx.deliveryAttempt.updateMany({
          where: { id: attemptId, riderId: null, status: 'prepared' },
          data: { riderId, status: 'claimed', claimedAt },
        })).count === 1,
        invalidateToken: async (attemptId) => {
          await tx.packageQrToken.updateMany({
            where: { deliveryAttemptId: attemptId, invalidatedAt: null },
            data: { invalidatedAt: new Date() },
          });
        },
      }),
    }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    if (result.kind === 'invalid') {
      return NextResponse.json({ message: 'รหัส QR ไม่ถูกต้องหรือหมดอายุ' }, { status: 422 });
    }
    if (result.kind === 'conflict') {
      return NextResponse.json({ message: 'พัสดุนี้ถูกรับงานแล้ว' }, { status: 409 });
    }

    await writeAuditEvent(db.auditEvent, {
      id: newPublicId(), actorId: rider.id, action: 'delivery_attempt.claimed',
      auditableType: 'DeliveryAttempt', auditableId: result.attemptId,
      reason: null, oldValues: null, newValues: { riderId: rider.id },
    });
    return NextResponse.json({ attemptId: result.attemptId }, { status: 200 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    throw error;
  }
}
