import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { parseZone } from '@/domain/admin/user-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

const LOOKBACK_DAYS = 90;

// HOSxP villages that had eligible visits recently, marked with whether a zone already covers them.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const villages = await (await getHosCandidateRepository()).villagesSince(since);
    const zones = await db.deliveryZone.findMany({ select: { subdistrictCode: true, villageCode: true } });
    const existing = new Set(zones.map((zone) => `${zone.subdistrictCode}/${zone.villageCode}`));
    return NextResponse.json({
      lookbackDays: LOOKBACK_DAYS,
      villages: villages.map((village) => ({
        ...village,
        displayName: zoneName(village.villageCode, village.subdistrictName, village.subdistrictCode),
        exists: existing.has(`${village.subdistrictCode}/${village.villageCode}`),
      })),
    });
  });
}

// Creates the chosen zones in one transaction, skipping any that already exist; existing zones only gain a missing subdistrict name.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const body = await readJsonBody(request) as { zones?: unknown } | undefined;
    if (!Array.isArray(body?.zones) || body.zones.length === 0 || body.zones.length > 1000) return invalidInput('ต้องเลือกหมู่บ้านอย่างน้อย 1 แห่ง');
    const zones = body.zones.map(parseZone);
    const names = new Map(zones.filter((zone) => zone.subdistrictName).map((zone) => [zone.subdistrictCode, zone.subdistrictName as string]));

    const created = await db.$transaction(async (tx) => {
      const existing = new Set((await tx.deliveryZone.findMany({ select: { subdistrictCode: true, villageCode: true } }))
        .map((zone) => `${zone.subdistrictCode}/${zone.villageCode}`));
      let count = 0;
      for (const zone of zones) {
        const key = `${zone.subdistrictCode}/${zone.villageCode}`;
        if (existing.has(key)) continue;
        existing.add(key);
        const record = await tx.deliveryZone.create({ data: { id: newPublicId(), ...zone } });
        await audit(tx, { actorId: admin.id, action: 'delivery_zone.created', auditableType: 'DeliveryZone', auditableId: record.id, newValues: zone });
        count += 1;
      }
      // Zones made before subdistrict names were kept pick the name up here, without overwriting one admin set.
      for (const [subdistrictCode, subdistrictName] of names) {
        await tx.deliveryZone.updateMany({ where: { subdistrictCode, subdistrictName: null }, data: { subdistrictName } });
      }
      return count;
    }, { timeout: 30_000 });

    return NextResponse.json({ created }, { status: 201 });
  });
}

function zoneName(villageCode: string, subdistrictName: string | null, subdistrictCode: string): string {
  return `หมู่ ${Number(villageCode) || villageCode} ${subdistrictName ?? `ตำบล ${subdistrictCode}`}`;
}
