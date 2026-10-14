import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const pageSize = 100;

// Read-only: the audit trail has no mutation handler.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'auditor', 'admin');
    const params = request.nextUrl.searchParams;
    const auditableId = params.get('auditableId')?.trim();
    const before = params.get('before');
    const events = await db.auditEvent.findMany({
      where: {
        ...(auditableId ? { auditableId } : {}),
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: pageSize,
    });
    const actors = await db.user.findMany({ where: { id: { in: [...new Set(events.map((event) => event.actorId))] } }, select: { id: true, displayName: true } });
    const names = new Map(actors.map((actor) => [actor.id, actor.displayName]));
    return NextResponse.json({
      events: events.map((event) => ({ ...event, actorName: names.get(event.actorId) ?? event.actorId })),
      nextBefore: events.length === pageSize ? events[events.length - 1]?.id : null,
    });
  });
}
