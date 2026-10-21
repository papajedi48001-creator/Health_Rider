import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles, type UserRole } from '@/auth/roles';
import { parseProfileChanges } from '@/domain/account/profile-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { knownHealthCenter } from '@/domain/admin/health-centers';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const profileFields = {
  id: true, username: true, displayName: true, phone: true, healthCenter: true, role: true, avatarUpdatedAt: true,
  riderProfile: { select: { riderCode: true, employmentCategory: true } },
  roleGrants: { select: { role: true } },
} as const;

// The roles held, in the usual order, and the one this sign-in works in.
function withRoles<T extends { roleGrants: Array<{ role: UserRole }> }>({ roleGrants, ...user }: T, activeRole: UserRole) {
  return { ...user, roles: userRoles.filter((role) => roleGrants.some((grant) => grant.role === role)), activeRole };
}

// The signed-in user's own account, whatever their role.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const user = await db.user.findUniqueOrThrow({ where: { id: session.id }, select: profileFields });
    return NextResponse.json(withRoles(user, session.role), { headers: { 'cache-control': 'no-store' } });
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const changes = parseProfileChanges(await readJsonBody(request));
    if (changes.healthCenter) await knownHealthCenter(db, changes.healthCenter);
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.user.findUniqueOrThrow({ where: { id: session.id }, select: { displayName: true, phone: true, healthCenter: true } });
      const after = await tx.user.update({ where: { id: session.id }, data: changes, select: profileFields });
      const changed = Object.keys(changes) as Array<keyof typeof changes>;
      await audit(tx, {
        actorId: session.id, action: 'user.profile_updated', auditableType: 'User', auditableId: session.id,
        oldValues: Object.fromEntries(changed.map((key) => [key, before[key]])),
        newValues: Object.fromEntries(changed.map((key) => [key, after[key]])),
      });
      return after;
    });
    return NextResponse.json(withRoles(updated, session.role));
  });
}
