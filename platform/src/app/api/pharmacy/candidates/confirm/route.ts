import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';
import { confirmCandidate } from '@/domain/delivery/confirm-candidate';
import { newPublicId } from '@/domain/delivery/status';
import type { HosCandidate } from '@/hos/types';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';

export async function POST(request: NextRequest) {
  try {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const candidate = await readJsonBody(request);
    if (!isHosCandidate(candidate)) {
      return NextResponse.json({ message: 'ข้อมูลผู้ป่วยสำหรับยืนยันไม่ถูกต้อง' }, { status: 422 });
    }

    const confirmed = await confirmCandidate(candidate, pharmacist, {
      findZone: (codes) => db.deliveryZone.findUnique({
        where: { subdistrictCode_villageCode: codes },
        select: { id: true },
      }),
      createRequest: (deliveryRequest) => db.deliveryRequest.create({ data: deliveryRequest }),
    });

    await writeAuditEvent(db.auditEvent, {
      id: newPublicId(),
      actorId: confirmed.createdById,
      action: 'delivery_request.created_from_hos_candidate',
      auditableType: 'DeliveryRequest',
      auditableId: confirmed.id,
      reason: null,
      oldValues: null,
      newValues: { hosVisitNumber: confirmed.hosVisitNumber, deliveryZoneId: confirmed.deliveryZoneId },
    });

    return NextResponse.json(confirmed, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    throw error;
  }
}

function isHosCandidate(value: unknown): value is HosCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.visitNumber === 'string' &&
    typeof candidate.hn === 'string' &&
    typeof candidate.patientName === 'string' &&
    (typeof candidate.patientAge === 'number' || candidate.patientAge === null) &&
    (typeof candidate.telephone === 'string' || candidate.telephone === null) &&
    typeof candidate.deliveryAddress === 'string' &&
    typeof candidate.subdistrictCode === 'string' &&
    typeof candidate.villageCode === 'string'
  );
}
