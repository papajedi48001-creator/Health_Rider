import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { parseRoleRequest } from '@/domain/admin/user-roles';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const requestFields = { id: true, role: true, reason: true, status: true, createdAt: true, decidedAt: true } as const;

// The signed-in user's own role requests, newest first.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const requests = await db.roleRequest.findMany({ where: { userId: session.id }, orderBy: { createdAt: 'desc' }, take: 20, select: requestFields });
    return NextResponse.json({ requests }, { headers: { 'cache-control': 'no-store' } });
  });
}

// Asks an admin for one more role; the account gets it only once an admin approves.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const body = await readJsonBody(request);
    const created = await db.$transaction(async (tx) => {
      const [held, pending] = await Promise.all([
        tx.userRoleGrant.findMany({ where: { userId: session.id }, select: { role: true } }),
        tx.roleRequest.findMany({ where: { userId: session.id, status: 'pending' }, select: { role: true } }),
      ]);
      const input = parseRoleRequest(body, held.map((grant) => grant.role), pending.map((item) => item.role));
      const saved = await tx.roleRequest.create({ data: { id: newPublicId(), userId: session.id, ...input }, select: requestFields });
      await audit(tx, {
        actorId: session.id, action: 'user.role_requested', auditableType: 'User', auditableId: session.id,
        newValues: { requestedRole: input.role, reason: input.reason },
      });
      return saved;
    });
    return NextResponse.json(created, { status: 201 });
  });
}
