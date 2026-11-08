import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { parseRoleSet, setUserRoles } from '@/domain/admin/user-roles';
import { audit } from '@/domain/audit/write-audit-event';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// An admin adds or takes away roles directly. Open sessions keep running: one working in a role that was taken
// away is asked to pick again, or moves to the only role left.
export async function PUT(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { userId } = await context.params;
    const set = parseRoleSet(await readJsonBody(request), admin.id, userId);
    const result = await db.$transaction(async (tx) => {
      const changed = await setUserRoles(tx, userId, set);
      await audit(tx, {
        actorId: admin.id, action: 'user.roles_changed', auditableType: 'User', auditableId: userId,
        oldValues: { roles: changed.before }, newValues: { roles: changed.after, ...(changed.riderCode ? { riderCode: changed.riderCode } : {}) },
      });
      return changed;
    });
    return NextResponse.json({ roles: result.after, riderCode: result.riderCode });
  });
}
