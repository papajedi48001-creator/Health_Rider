import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest, sessionCookieOptions, sessionStore } from '@/auth/current-session';
import { UnauthenticatedError, UnauthorizedError } from '@/auth/require-role';
import { roleHome } from '@/auth/role-home';
import { userRoles, type UserRole } from '@/auth/roles';
import { chooseSessionRole, hashSessionToken, sessionCookieName } from '@/auth/session';
import { viewCookieName } from '@/auth/view-as';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { basePath } from '@/lib/base-path';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Picks which of the account's roles this sign-in works in, right after login or when switching later.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = await getSessionFromRequest(request);
    const token = request.cookies.get(sessionCookieName)?.value;
    if (!session || !token) throw new UnauthenticatedError();
    const role = (await readJsonBody(request) as { role?: unknown } | undefined)?.role;
    if (!(userRoles as readonly unknown[]).includes(role)) throw new DomainError('บทบาทไม่ถูกต้อง');
    const held = session.roles ?? [session.role];
    if (!held.includes(role as UserRole)) throw new UnauthorizedError();

    const secret = getAuthSecret(process.env);
    await chooseSessionRole(token, role as UserRole, secret, sessionStore);
    await audit(db, {
      actorId: session.id, action: 'user.role_selected', auditableType: 'User', auditableId: session.id,
      oldValues: session.roleChoicePending ? null : { role: session.role }, newValues: { role },
    });
    const stored = await db.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(token, secret) }, select: { expiresAt: true } });

    const response = NextResponse.json({ role, home: roleHome(role as UserRole) });
    // A rider's phone keeps the cookie for the shift; staff roles end it when the browser closes.
    response.cookies.set(sessionCookieName, token, sessionCookieOptions(stored.expiresAt, role as UserRole));
    // An admin's menu view belongs to the admin role; it starts over after any switch.
    response.cookies.set(viewCookieName, '', { httpOnly: true, sameSite: 'lax', path: basePath || '/', maxAge: 0 });
    return response;
  });
}
