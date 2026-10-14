import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { packageQrLifetimeMs } from '@/domain/delivery/package-qr-policy';
import { reissuePackageQr } from '@/domain/delivery/reissue-package-qr';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { attemptId } = await context.params;
    const token = await db.$transaction(async (tx) => {
      const issued = await reissuePackageQr(attemptId, new Date(Date.now() + packageQrLifetimeMs), pharmacist, {
        findAttempt: (id) => tx.deliveryAttempt.findUnique({ where: { id }, select: { id: true, status: true } }),
        invalidateTokens: (id, at) => tx.packageQrToken.updateMany({ where: { deliveryAttemptId: id, invalidatedAt: null }, data: { invalidatedAt: at } }),
        createToken: async (record) => { await tx.packageQrToken.create({ data: record }); },
      });
      await audit(tx, { actorId: pharmacist.id, action: 'package_qr.reissued', auditableType: 'DeliveryAttempt', auditableId: attemptId });
      return issued;
    });
    return NextResponse.json({ attemptId, token }, { status: 201 });
  });
}
