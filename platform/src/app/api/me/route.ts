import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { parseProfileChanges } from '@/domain/account/profile-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const profileFields = {
  id: true, username: true, displayName: true, phone: true, role: true, avatarUpdatedAt: true,
  riderProfile: { select: { riderCode: true, employmentCategory: true } },
} as const;

// The signed-in user's own account, whatever their role.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const user = await db.user.findUniqueOrThrow({ where: { id: session.id }, select: profileFields });
    return NextResponse.json(user, { headers: { 'cache-control': 'no-store' } });
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const changes = parseProfileChanges(await readJsonBody(request));
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: session.id }, select: { displayName: true, phone: true } });
      const after = await tx.user.update({ where: { id: session.id }, data: changes, select: profileFields });
      const changed = Object.keys(changes) as Array<keyof typeof changes>;
      await audit(tx, {
        actorId: session.id, action: 'user.profile_updated', auditableType: 'User', auditableId: session.id,
        oldValues: Object.fromEntries(changed.map((key) => [key, before[key]])),
        newValues: Object.fromEntries(changed.map((key) => [key, after[key]])),
      });
      return after;
    });
    return NextResponse.json(updated);
  });
}
