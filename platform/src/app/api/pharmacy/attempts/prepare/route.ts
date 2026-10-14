import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import { packageQrLifetimeMs } from '@/domain/delivery/package-qr-policy';
import { prepareAttempt } from '@/domain/delivery/prepare-attempt';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const body = await readJsonBody(request) as { deliveryRequestId?: unknown } | undefined;
    if (!body || typeof body.deliveryRequestId !== 'string') return invalidInput('ไม่พบงานจัดส่งที่ต้องเตรียม');
    const deliveryRequestId = body.deliveryRequestId;

    const prepared = await db.$transaction(async (tx) => {
      // Locks the request so two pharmacists cannot prepare it at the same time.
      await tx.$queryRaw`SELECT id FROM delivery_requests WHERE id = ${deliveryRequestId} FOR UPDATE`;
      const attempt = await prepareAttempt(deliveryRequestId, pharmacist, {
        findRequest: async (id) => {
          const found = await tx.deliveryRequest.findUnique({
            where: { id },
            select: { id: true, attempts: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
          });
          return found && { id: found.id, latestAttemptStatus: found.attempts[0]?.status ?? null };
        },
        createAttempt: (record) => tx.deliveryAttempt.create({ data: record, select: { id: true, deliveryRequestId: true, status: true } }),
      });
      const token = await issuePackageQr(attempt.id, new Date(Date.now() + packageQrLifetimeMs), {
        create: async (record) => { await tx.packageQrToken.create({ data: record }); },
      });
      await audit(tx, {
        actorId: pharmacist.id, action: 'delivery_attempt.prepared', auditableType: 'DeliveryAttempt', auditableId: attempt.id,
        newValues: { deliveryRequestId: attempt.deliveryRequestId, status: 'prepared' },
      });
      return { attempt, token };
    });

    return NextResponse.json({ attemptId: prepared.attempt.id, token: prepared.token }, { status: 201 });
  });
}
