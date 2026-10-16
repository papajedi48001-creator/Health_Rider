import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { removeAvatar, saveAvatar } from '@/account/avatar-storage';
import { audit } from '@/domain/audit/write-audit-event';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Uploads or replaces the signed-in user's profile photo.
export async function PUT(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const body = await readJsonBody(request) as { photo?: unknown } | undefined;
    await saveAvatar(session.id, body?.photo);
    const avatarUpdatedAt = new Date();
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: session.id }, data: { avatarUpdatedAt } });
      await audit(tx, { actorId: session.id, action: 'user.avatar_updated', auditableType: 'User', auditableId: session.id });
    });
    return NextResponse.json({ avatarVersion: avatarUpdatedAt.getTime() });
  });
}

// Removes the profile photo; the initial of the name is shown again.
export async function DELETE(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: session.id }, data: { avatarUpdatedAt: null } });
      await audit(tx, { actorId: session.id, action: 'user.avatar_removed', auditableType: 'User', auditableId: session.id });
    });
    await removeAvatar(session.id);
    return NextResponse.json({ avatarVersion: null });
  });
}
