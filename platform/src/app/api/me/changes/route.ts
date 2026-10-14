import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const accountActions = ['user.created', 'user.updated', 'user.profile_updated', 'user.password_changed'];

// The audit trail of the signed-in user's own account: their edits and an admin's, newest first.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const events = await db.auditEvent.findMany({
      where: { auditableType: 'User', auditableId: session.id, action: { in: accountActions } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, action: true, actorId: true, oldValues: true, newValues: true, createdAt: true },
    });
    return NextResponse.json({
      changes: events.map((event) => ({
        id: event.id,
        action: event.action,
        at: event.createdAt.toISOString(),
        byMe: event.actorId === session.id,
        oldValues: event.action === 'user.created' ? null : event.oldValues,
        newValues: event.action === 'user.created' ? null : event.newValues,
      })),
    }, { headers: { 'cache-control': 'no-store' } });
  });
}
