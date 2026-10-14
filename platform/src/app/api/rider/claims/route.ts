import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireRole } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/current-session';
import { audit } from '@/domain/audit/write-audit-event';
import { claimPackageQr } from '@/domain/delivery/claim-package-qr';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const body = await readJsonBody(request) as { token?: unknown } | undefined;
    if (!body || typeof body.token !== 'string' || body.token.length < 20) return invalidInput('รหัส QR ไม่ถูกต้อง');
    const token = body.token;

    const result = await db.$transaction(async (tx) => {
      const claim = await claimPackageQr(token, rider.id, new Date(), {
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
      });
      if (claim.kind === 'claimed') {
        await audit(tx, {
          actorId: rider.id, action: 'delivery_attempt.claimed', auditableType: 'DeliveryAttempt', auditableId: claim.attemptId,
          oldValues: { status: 'prepared' }, newValues: { status: 'claimed', riderId: rider.id },
        });
      }
      return claim;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    if (result.kind === 'invalid') return invalidInput('รหัส QR ไม่ถูกต้องหรือหมดอายุ');
    if (result.kind === 'conflict') return NextResponse.json({ message: 'พัสดุนี้ถูกรับงานแล้ว' }, { status: 409 });
    return NextResponse.json({ attemptId: result.attemptId }, { status: 200 });
  });
}
