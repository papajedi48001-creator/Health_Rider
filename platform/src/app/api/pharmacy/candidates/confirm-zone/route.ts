import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { confirmCandidate } from '@/domain/delivery/confirm-candidate';
import { findRateInEffect } from '@/domain/delivery/service-rate';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';
import { startOfBangkokDay } from '@/lib/time';

// Confirms every unconfirmed HOSxP visit in one zone for a date, reading HOSxP once; all or nothing.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const body = await readJsonBody(request) as { zoneId?: unknown; date?: unknown } | undefined;
    const on = typeof body?.date === 'string' ? startOfBangkokDay(body.date) : null;
    if (!body || typeof body.zoneId !== 'string' || !on) return invalidInput('ข้อมูลโซนสำหรับยืนยันไม่ถูกต้อง');

    const zone = await db.deliveryZone.findFirst({ where: { id: body.zoneId, active: true } });
    if (!zone) return NextResponse.json({ message: 'ไม่พบโซนจัดส่งนี้' }, { status: 404 });

    const inZone = (await (await getHosCandidateRepository()).eligibleFor(on))
      .filter((candidate) => candidate.subdistrictCode === zone.subdistrictCode && candidate.villageCode === zone.villageCode);
    const confirmed = inZone.length === 0 ? [] : await db.deliveryRequest.findMany({
      where: { hosVisitNumber: { in: inZone.map((candidate) => candidate.visitNumber) } }, select: { hosVisitNumber: true },
    });
    const confirmedVisits = new Set(confirmed.map((item) => item.hosVisitNumber));
    const pending = inZone.filter((candidate) => !confirmedVisits.has(candidate.visitNumber));

    const created = await db.$transaction(async (tx) => {
      const requests = [];
      for (const candidate of pending) {
        const request = await confirmCandidate(candidate, pharmacist, {
          findZone: async () => ({ id: zone.id }),
          findRate: (rateZone) => findRateInEffect(tx, rateZone),
          createRequest: (deliveryRequest) => tx.deliveryRequest.create({ data: deliveryRequest }),
        });
        await audit(tx, {
          actorId: request.createdById, action: 'delivery_request.created_from_hos_candidate', auditableType: 'DeliveryRequest', auditableId: request.id,
          newValues: { hosVisitNumber: request.hosVisitNumber, deliveryZoneId: request.deliveryZoneId, rateSatang: request.rateSatang },
        });
        requests.push(request);
      }
      return requests;
    }, { timeout: 30_000 });

    return NextResponse.json({ confirmed: created.length, visitNumbers: created.map((item) => item.hosVisitNumber) }, { status: 201 });
  });
}
