import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { parseZone } from '@/domain/admin/user-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const zones = await db.deliveryZone.findMany({ orderBy: [{ subdistrictCode: 'asc' }, { villageCode: 'asc' }] });
    return NextResponse.json({ zones });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const zone = parseZone(await readJsonBody(request));
    const created = await db.$transaction(async (tx) => {
      const record = await tx.deliveryZone.create({ data: { id: newPublicId(), ...zone } });
      await audit(tx, { actorId: admin.id, action: 'delivery_zone.created', auditableType: 'DeliveryZone', auditableId: record.id, newValues: zone });
      return record;
    });
    return NextResponse.json(created, { status: 201 });
  });
}
