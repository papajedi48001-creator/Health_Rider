import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { confirmCandidate } from '@/domain/delivery/confirm-candidate';
import { DomainError } from '@/domain/errors';
import { findRateInEffect } from '@/domain/delivery/service-rate';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';
import { startOfBangkokDay } from '@/lib/time';

const maximumVisits = 500;

// Confirms the listed HOSxP visits of a date, reading HOSxP once. Each visit is saved on its own, so one that
// cannot be confirmed (no zone, already confirmed meanwhile) is reported instead of stopping the rest.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const pharmacist = requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const body = await readJsonBody(request) as { visitNumbers?: unknown; date?: unknown } | undefined;
    const on = typeof body?.date === 'string' ? startOfBangkokDay(body.date) : null;
    const visitNumbers = Array.isArray(body?.visitNumbers) ? [...new Set(body.visitNumbers)] : [];
    if (!on || visitNumbers.length === 0 || visitNumbers.length > maximumVisits || !visitNumbers.every((visit) => typeof visit === 'string')) {
      return invalidInput(`ต้องระบุรายการที่จะยืนยัน 1-${maximumVisits} ราย`);
    }

    const wanted = new Set(visitNumbers as string[]);
    const candidates = (await (await getHosCandidateRepository()).eligibleFor(on)).filter((candidate) => wanted.has(candidate.visitNumber));
    const confirmed = candidates.length === 0 ? [] : await db.deliveryRequest.findMany({
      where: { hosVisitNumber: { in: candidates.map((candidate) => candidate.visitNumber) } }, select: { hosVisitNumber: true },
    });
    const confirmedVisits = new Set(confirmed.map((item) => item.hosVisitNumber));
    const zones = await db.deliveryZone.findMany({ where: { active: true }, select: { id: true, subdistrictCode: true, villageCode: true } });
    const zoneOf = new Map(zones.map((zone) => [`${zone.subdistrictCode}-${zone.villageCode}`, zone]));

    const created: string[] = [];
    const failed: Array<{ visitNumber: string; patientName: string | null; reason: string }> = [];
    const found = new Set(candidates.map((candidate) => candidate.visitNumber));
    for (const visitNumber of wanted) {
      if (!found.has(visitNumber)) failed.push({ visitNumber, patientName: null, reason: 'ไม่พบในรายการรอยืนยันจาก HOSxP ของวันนี้' });
    }

    for (const candidate of candidates) {
      if (confirmedVisits.has(candidate.visitNumber)) {
        failed.push({ visitNumber: candidate.visitNumber, patientName: candidate.patientName, reason: 'ยืนยันไปแล้ว' });
        continue;
      }
      try {
        await db.$transaction(async (tx) => {
          const request = await confirmCandidate(candidate, pharmacist, {
            findZone: async (codes) => zoneOf.get(`${codes.subdistrictCode}-${codes.villageCode}`) ?? null,
            findRate: (rateZone) => findRateInEffect(tx, rateZone),
            createRequest: (deliveryRequest) => tx.deliveryRequest.create({ data: deliveryRequest }),
          });
          await audit(tx, {
            actorId: request.createdById, action: 'delivery_request.created_from_hos_candidate', auditableType: 'DeliveryRequest', auditableId: request.id,
            newValues: { hosVisitNumber: request.hosVisitNumber, deliveryZoneId: request.deliveryZoneId, rateSatang: request.rateSatang },
          });
        });
        created.push(candidate.visitNumber);
      } catch (error) {
        failed.push({ visitNumber: candidate.visitNumber, patientName: candidate.patientName, reason: reasonFor(error) });
      }
    }

    return NextResponse.json({ confirmed: created.length, visitNumbers: created, failed }, { status: 201 });
  });
}

function reasonFor(error: unknown): string {
  if (error instanceof DomainError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return 'ยืนยันไปแล้ว';
  return 'บันทึกไม่สำเร็จ';
}
