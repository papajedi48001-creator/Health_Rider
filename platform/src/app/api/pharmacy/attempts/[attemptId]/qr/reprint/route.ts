import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { checkReprintToken } from '@/domain/delivery/reprint-package-qr';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// Confirms the QR the pharmacy browser kept is still the package's live QR, so its label can be printed again unchanged.
export async function POST(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const { attemptId } = await context.params;
    const body = await readJsonBody(request) as { token?: unknown } | undefined;
    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    await db.$transaction(async (tx) => {
      await checkReprintToken(attemptId, token, new Date(), pharmacist, {
        findToken: (tokenHash) => tx.packageQrToken.findUnique({
          where: { tokenHash },
          select: { deliveryAttemptId: true, expiresAt: true, invalidatedAt: true, deliveryAttempt: { select: { status: true } } },
        }).then((record) => record && ({
          deliveryAttemptId: record.deliveryAttemptId, expiresAt: record.expiresAt, invalidatedAt: record.invalidatedAt,
          attemptStatus: record.deliveryAttempt.status as DeliveryAttemptStatus,
        })),
      });
      await audit(tx, { actorId: pharmacist.id, action: 'package_qr.reprinted', auditableType: 'DeliveryAttempt', auditableId: attemptId });
    });
    return NextResponse.json({ attemptId, token }, { status: 200 });
  });
}
