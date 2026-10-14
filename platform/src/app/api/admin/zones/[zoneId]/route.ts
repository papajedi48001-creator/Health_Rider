import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

// Zones are deactivated rather than deleted because Delivery Requests keep referring to them.
export async function PATCH(request: NextRequest, context: { params: Promise<{ zoneId: string }> }) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { zoneId } = await context.params;
    const body = await readJsonBody(request) as { displayName?: unknown; subdistrictName?: unknown; active?: unknown } | undefined;
    const changes: { displayName?: string; subdistrictName?: string | null; active?: boolean } = {};
    if (typeof body?.displayName === 'string' && body.displayName.trim()) changes.displayName = body.displayName.trim();
    if (typeof body?.subdistrictName === 'string') changes.subdistrictName = body.subdistrictName.trim() || null;
    if (typeof body?.active === 'boolean') changes.active = body.active;
    if (Object.keys(changes).length === 0) return invalidInput('ไม่มีข้อมูลที่เปลี่ยนแปลง');

    const updated = await db.$transaction(async (tx) => {
      const before = await tx.deliveryZone.findUnique({ where: { id: zoneId } });
      if (!before) throw new DomainError('ไม่พบโซน', 404);
      const after = await tx.deliveryZone.update({ where: { id: zoneId }, data: changes });
      await audit(tx, {
        actorId: admin.id, action: 'delivery_zone.updated', auditableType: 'DeliveryZone', auditableId: zoneId,
        oldValues: { displayName: before.displayName, subdistrictName: before.subdistrictName, active: before.active },
        newValues: { displayName: after.displayName, subdistrictName: after.subdistrictName, active: after.active },
      });
      return after;
    });
    return NextResponse.json(updated);
  });
}
