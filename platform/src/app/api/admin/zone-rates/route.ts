import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/session';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { db } from '@/lib/db';
import { createZoneRate, OverlappingZoneRateError } from '@/domain/rates/create-zone-rate';
import { newPublicId } from '@/domain/delivery/status';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';

export async function POST(request: NextRequest) {
  try {
    const admin = requireRole(getSessionFromRequest(request), 'admin');
    const body = await request.json();

    if (!isValidBody(body)) {
      return NextResponse.json({ message: 'ข้อมูลอัตราค่าบริการไม่ถูกต้อง' }, { status: 422 });
    }

    const rate = await createZoneRate(
      {
        id: newPublicId(),
        deliveryZoneId: body.deliveryZoneId,
        satang: body.satang,
        effectiveFrom: new Date(`${body.effectiveFrom}T00:00:00.000Z`),
        effectiveUntil: body.effectiveUntil ? new Date(`${body.effectiveUntil}T00:00:00.000Z`) : null,
        createdById: admin.id,
      },
      {
        listForZone: (deliveryZoneId) => db.zoneRate.findMany({ where: { deliveryZoneId } }),
        create: (input) => db.zoneRate.create({ data: input }),
      },
    );

    await writeAuditEvent(db.auditEvent, {
      id: newPublicId(),
      actorId: admin.id,
      action: 'zone_rate.created',
      auditableType: 'ZoneRate',
      auditableId: rate.id,
      reason: null,
      oldValues: null,
      newValues: { satang: rate.satang, effectiveFrom: rate.effectiveFrom.toISOString() },
    });

    return NextResponse.json(rate, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    if (error instanceof OverlappingZoneRateError) {
      return NextResponse.json({ message: error.message }, { status: 409 });
    }
    throw error;
  }
}

function isValidBody(body: unknown): body is {
  deliveryZoneId: string;
  satang: number;
  effectiveFrom: string;
  effectiveUntil?: string;
} {
  if (!body || typeof body !== 'object') return false;
  const candidate = body as Record<string, unknown>;
  return (
    typeof candidate.deliveryZoneId === 'string' &&
    Number.isInteger(candidate.satang) &&
    (candidate.satang as number) > 0 &&
    typeof candidate.effectiveFrom === 'string' &&
    (!candidate.effectiveUntil || typeof candidate.effectiveUntil === 'string')
  );
}
