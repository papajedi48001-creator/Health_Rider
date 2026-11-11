import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

// Sets one รพ.สต. on many zones at once, usually every village of a subdistrict; an empty choice clears it.
export async function PUT(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const body = await readJsonBody(request) as { zoneIds?: unknown; healthCenterId?: unknown } | undefined;
    const zoneIds = Array.isArray(body?.zoneIds) ? [...new Set(body.zoneIds.filter((id): id is string => typeof id === 'string' && id.length > 0))] : [];
    if (zoneIds.length === 0) return invalidInput('ยังไม่ได้เลือกโซน');
    if (typeof body?.healthCenterId !== 'string') return invalidInput('ต้องเลือก รพ.สต.');
    const healthCenterId = body.healthCenterId.trim() || null;

    const updated = await db.$transaction(async (tx) => {
      if (healthCenterId && !(await tx.healthCenter.findUnique({ where: { id: healthCenterId }, select: { id: true } }))) {
        throw new DomainError('ไม่พบ รพ.สต. ที่เลือก');
      }
      const zones = await tx.deliveryZone.findMany({ where: { id: { in: zoneIds } }, select: { id: true, healthCenterId: true } });
      const changing = zones.filter((zone) => zone.healthCenterId !== healthCenterId);
      if (changing.length === 0) return 0;
      await tx.deliveryZone.updateMany({ where: { id: { in: changing.map((zone) => zone.id) } }, data: { healthCenterId } });
      for (const zone of changing) {
        await audit(tx, {
          actorId: admin.id, action: 'delivery_zone.updated', auditableType: 'DeliveryZone', auditableId: zone.id,
          oldValues: { healthCenterId: zone.healthCenterId }, newValues: { healthCenterId },
        });
      }
      return changing.length;
    });
    return NextResponse.json({ updated });
  });
}
