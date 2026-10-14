import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { parseServiceRate } from '@/domain/delivery/service-rate';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const rates = await db.serviceRate.findMany({
      orderBy: [{ subdistrictCode: 'asc' }, { effectiveFrom: 'desc' }],
      select: { id: true, subdistrictCode: true, deliveryZoneId: true, rateSatang: true, effectiveFrom: true, createdAt: true },
    });
    return NextResponse.json({ rates });
  });
}

// Rates are only ever added; a new rate with a later start date supersedes the old one, so confirmed requests keep theirs.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const rate = parseServiceRate(await readJsonBody(request));

    const created = await db.$transaction(async (tx) => {
      if (rate.deliveryZoneId) {
        const zone = await tx.deliveryZone.findUnique({ where: { id: rate.deliveryZoneId }, select: { subdistrictCode: true } });
        if (!zone) throw new DomainError('ไม่พบโซน', 404);
        if (zone.subdistrictCode !== rate.subdistrictCode) throw new DomainError('โซนนี้ไม่อยู่ในตำบลที่เลือก');
      } else if (!(await tx.deliveryZone.findFirst({ where: { subdistrictCode: rate.subdistrictCode }, select: { id: true } }))) {
        throw new DomainError('ยังไม่มีโซนในตำบลนี้');
      }
      const record = await tx.serviceRate.create({ data: { id: newPublicId(), ...rate, createdById: admin.id } });
      await audit(tx, {
        actorId: admin.id, action: 'service_rate.created', auditableType: 'ServiceRate', auditableId: record.id,
        newValues: { subdistrictCode: rate.subdistrictCode, deliveryZoneId: rate.deliveryZoneId, rateSatang: rate.rateSatang, effectiveFrom: rate.effectiveFrom.toISOString().slice(0, 10) },
      });
      return record;
    });
    return NextResponse.json(created, { status: 201 });
  });
}
