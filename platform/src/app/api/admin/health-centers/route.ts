import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { parseHealthCenterInput } from '@/domain/admin/health-centers';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Every รพ.สต. with how many accounts belong to it, so the admin can see which ones are safe to remove.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const [healthCenters, members] = await Promise.all([
      db.healthCenter.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, hospcode: true } }),
      db.user.groupBy({ by: ['healthCenter'], _count: { _all: true } }),
    ]);
    const counts = new Map(members.map((row) => [row.healthCenter, row._count._all]));
    return NextResponse.json({ healthCenters: healthCenters.map((center) => ({ ...center, users: counts.get(center.name) ?? 0 })) });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const input = parseHealthCenterInput(await readJsonBody(request));
    const created = await db.$transaction(async (tx) => {
      const record = await tx.healthCenter.create({ data: { id: newPublicId(), ...input }, select: { id: true, name: true, hospcode: true } });
      await audit(tx, { actorId: admin.id, action: 'health_center.created', auditableType: 'HealthCenter', auditableId: record.id, newValues: input });
      return record;
    });
    return NextResponse.json({ ...created, users: 0 }, { status: 201 });
  });
}
