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

// Patient details are re-read from HOS on the server; the browser only names the visit to confirm.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const body = await readJsonBody(request) as { visitNumber?: unknown; date?: unknown } | undefined;
    const on = typeof body?.date === 'string' ? startOfBangkokDay(body.date) : null;
    if (!body || typeof body.visitNumber !== 'string' || !on) return invalidInput('ข้อมูลผู้ป่วยสำหรับยืนยันไม่ถูกต้อง');
    const visitNumber = body.visitNumber;

    const candidate = (await getHosCandidateRepository(process.env).eligibleFor(on)).find((item) => item.visitNumber === visitNumber);
    if (!candidate) return NextResponse.json({ message: 'ไม่พบผู้ป่วยรายนี้ในรายการที่เข้าเกณฑ์จาก HOS' }, { status: 404 });

    const confirmed = await db.$transaction(async (tx) => {
      const created = await confirmCandidate(candidate, pharmacist, {
        findZone: (codes) => tx.deliveryZone.findFirst({ where: { ...codes, active: true }, select: { id: true } }),
        findRate: (rateZone) => findRateInEffect(tx, rateZone),
        createRequest: (deliveryRequest) => tx.deliveryRequest.create({ data: deliveryRequest }),
      });
      await audit(tx, {
        actorId: created.createdById, action: 'delivery_request.created_from_hos_candidate', auditableType: 'DeliveryRequest', auditableId: created.id,
        newValues: { hosVisitNumber: created.hosVisitNumber, deliveryZoneId: created.deliveryZoneId, rateSatang: created.rateSatang },
      });
      return created;
    });

    return NextResponse.json(confirmed, { status: 201 });
  });
}
