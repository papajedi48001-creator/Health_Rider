import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { hashPassword } from '@/auth/session';
import { parseUserChanges } from '@/domain/admin/user-rules';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// Deactivating an account or resetting its password also ends its open sessions.
export async function PATCH(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { userId } = await context.params;
    const { password, ...changes } = parseUserChanges(await readJsonBody(request), admin.id, userId);
    const passwordHash = password ? await hashPassword(password) : undefined;

    const updated = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { displayName: true, phone: true, healthCenter: true, role: true, active: true, pendingApproval: true } });
      if (!before) throw new DomainError('ไม่พบบัญชีผู้ใช้', 404);
      if (before.pendingApproval && changes.active === true) throw new DomainError('บัญชีนี้รออนุมัติ โปรดใช้ปุ่มอนุมัติ');
      const after = await tx.user.update({
        where: { id: userId },
        data: { ...changes, ...(passwordHash ? { passwordHash, mustChangePassword: true } : {}) },
        select: { id: true, username: true, displayName: true, phone: true, healthCenter: true, role: true, active: true },
      });
      if (changes.active === false || passwordHash) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      const changed = Object.keys(changes) as Array<keyof typeof changes>;
      await audit(tx, {
        actorId: admin.id, action: 'user.updated', auditableType: 'User', auditableId: userId,
        oldValues: Object.fromEntries(changed.map((key) => [key, before[key]])),
        newValues: { ...Object.fromEntries(changed.map((key) => [key, after[key]])), ...(passwordHash ? { passwordReset: true } : {}) },
      });
      return after;
    });
    return NextResponse.json(updated);
  });
}
