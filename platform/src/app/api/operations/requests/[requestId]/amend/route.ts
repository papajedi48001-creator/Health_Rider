import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { amendInTransit } from '@/domain/delivery/amend-in-transit';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

type AmendmentBody = { deliveryAddress?: unknown; telephone?: unknown; reason?: unknown; expectedVersion?: unknown };

export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleRoute(async () => {
    const coordinator = requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const { requestId } = await context.params;
    const body = await readJsonBody(request) as AmendmentBody | undefined;
    if (!body || typeof body.reason !== 'string' || !Number.isInteger(body.expectedVersion)
      || (body.deliveryAddress !== undefined && typeof body.deliveryAddress !== 'string')
      || (body.telephone !== undefined && typeof body.telephone !== 'string')) {
      return invalidInput('ข้อมูลการแก้ไขไม่ถูกต้อง');
    }
    if ('hn' in body || 'packageId' in body) return invalidInput('แก้ไข HN หรือข้อมูลพัสดุไม่ได้');
    const data = {
      reason: body.reason,
      expectedVersion: body.expectedVersion as number,
      deliveryAddress: (body.deliveryAddress as string | undefined)?.trim() || undefined,
      telephone: (body.telephone as string | undefined)?.trim() || undefined,
    };

    const amended = await db.$transaction(async (tx) => amendInTransit(requestId, data, coordinator, {
      findInTransitRequest: (id) => tx.deliveryRequest.findFirst({
        where: { id, attempts: { some: { status: { in: ['claimed', 'in_transit', 'sync_review'] } } } },
        select: { id: true, deliveryVersion: true, hn: true, deliveryAddress: true, telephone: true },
      }),
      update: async ({ id, fromVersion, ...changes }) => (await tx.deliveryRequest.updateMany({ where: { id, deliveryVersion: fromVersion }, data: changes })).count === 1,
      createAudit: (entry) => audit(tx, { ...entry, auditableType: 'DeliveryRequest' }),
    }));
    return NextResponse.json(amended);
  });
}
