import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { deliveryAttemptStatuses, type DeliveryAttemptStatus } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { handleRoute, invalidInput } from '@/lib/route';
import { bangkokDateString, startOfBangkokDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

// Attempts prepared on one Thai day, optionally narrowed by status or zone.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin', 'auditor');
    const params = request.nextUrl.searchParams;
    const status = params.get('status');
    const zoneId = params.get('zoneId');
    const date = params.get('date') ?? bangkokDateString(new Date());
    const dayStart = startOfBangkokDay(date);
    if (!dayStart || (status && !deliveryAttemptStatuses.includes(status as DeliveryAttemptStatus))) return invalidInput('ตัวกรองไม่ถูกต้อง');

    const where: Prisma.DeliveryAttemptWhereInput = {
      createdAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000) },
      ...(status ? { status: status as DeliveryAttemptStatus } : {}),
      ...(zoneId ? { deliveryRequest: { deliveryZoneId: zoneId } } : {}),
    };
    const [attempts, zones] = await Promise.all([
      db.deliveryAttempt.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, status: true, createdAt: true, claimedAt: true, pickedUpAt: true, deliveredAt: true, failedAt: true, failureReason: true,
          rider: { select: { displayName: true } },
          deliveryRequest: {
            select: { id: true, hn: true, patientName: true, telephone: true, deliveryAddress: true, deliveryVersion: true, deliveryZone: { select: { displayName: true } } },
          },
        },
      }),
      db.deliveryZone.findMany({ where: { active: true }, orderBy: { displayName: 'asc' }, select: { id: true, displayName: true } }),
    ]);
    return NextResponse.json({ date, attempts, zones });
  });
}
