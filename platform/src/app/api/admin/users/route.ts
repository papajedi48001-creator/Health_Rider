import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { hashPassword } from '@/auth/session';
import { suggestRiderCode } from '@/domain/admin/rider-code';
import { parseNewUser } from '@/domain/admin/user-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';
import { assertRiderSeatAvailable } from '@/license/license-store';

export const dynamic = 'force-dynamic';

const userSelect = {
  id: true, username: true, displayName: true, avatarUpdatedAt: true, phone: true, role: true, active: true, pendingApproval: true, createdAt: true,
  riderProfile: { select: { riderCode: true, employmentCategory: true } },
} as const;

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const users = await db.user.findMany({ orderBy: [{ pendingApproval: 'desc' }, { role: 'asc' }, { username: 'asc' }], select: userSelect });
    return NextResponse.json({ users });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const input = parseNewUser(await readJsonBody(request));
    const passwordHash = await hashPassword(input.password);
    const user = await db.$transaction(async (tx) => {
      if (input.role === 'rider') await assertRiderSeatAvailable(tx);
      // Two admins saving at once can draw the same code; the unique index refuses the second and they save again.
      const rider = input.rider && { ...input.rider, riderCode: await suggestRiderCode(tx, input.rider.employmentCategory) };
      const created = await tx.user.create({
        data: {
          id: newPublicId(), username: input.username, displayName: input.displayName, role: input.role, passwordHash,
          ...(rider ? { riderProfile: { create: { id: newPublicId(), ...rider } } } : {}),
        },
        select: userSelect,
      });
      await audit(tx, {
        actorId: admin.id, action: 'user.created', auditableType: 'User', auditableId: created.id,
        newValues: { username: created.username, role: created.role, riderCode: created.riderProfile?.riderCode ?? null },
      });
      return created;
    });
    return NextResponse.json(user, { status: 201 });
  });
}
