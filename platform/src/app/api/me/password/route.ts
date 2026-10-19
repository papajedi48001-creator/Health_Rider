import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { hashPassword, hashSessionToken, sessionCookieName, verifyPassword } from '@/auth/session';
import { parsePasswordChange } from '@/domain/account/profile-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// Changing your own password needs the current one, and signs out every other device but this one.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const { currentPassword, newPassword } = parsePasswordChange(await readJsonBody(request));
    const user = await db.user.findUniqueOrThrow({ where: { id: session.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new DomainError('รหัสผ่านปัจจุบันไม่ถูกต้อง', 422);
    if (newPassword === currentPassword) throw new DomainError('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');

    const passwordHash = await hashPassword(newPassword);
    const currentTokenHash = hashSessionToken(request.cookies.get(sessionCookieName)?.value ?? '', getAuthSecret(process.env));
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: session.id }, data: { passwordHash, mustChangePassword: false } });
      await tx.session.updateMany({ where: { userId: session.id, revokedAt: null, tokenHash: { not: currentTokenHash } }, data: { revokedAt: new Date() } });
      await audit(tx, {
        actorId: session.id, action: 'user.password_changed', auditableType: 'User', auditableId: session.id,
        oldValues: null, newValues: { passwordChanged: true },
      });
    });
    return NextResponse.json({ ok: true });
  });
}
