import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { SessionUser } from '@/auth/require-role';
import type { UserRole } from '@/auth/roles';
import { basePath } from '@/lib/base-path';
import { resolveSession, sessionCookieName, type SessionStore } from '@/auth/session';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';

export const sessionStore: SessionStore = {
  create: (record) => db.session.create({ data: record }),
  findByTokenHash: (tokenHash) => db.session.findUnique({
    where: { tokenHash },
    select: { expiresAt: true, lastSeenAt: true, revokedAt: true, user: { select: { id: true, role: true, displayName: true, active: true, avatarUpdatedAt: true, mustChangePassword: true } } },
  }),
  revoke: (tokenHash, revokedAt) => db.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt } }),
  touch: (tokenHash, lastSeenAt) => db.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { lastSeenAt } }),
};

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  return sessionFromToken(request.cookies.get(sessionCookieName)?.value);
}

export async function getSessionFromCookies(): Promise<SessionUser | null> {
  return sessionFromToken((await cookies()).get(sessionCookieName)?.value);
}

// Staff cookies last only until the browser closes; a rider's phone keeps it for the shift so offline work can sync.
export function sessionCookieOptions(expiresAt: Date, role: UserRole) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_INSECURE !== 'true',
    // Scoped to this app, since the hospital domain also serves other sites.
    path: basePath || '/',
    ...(role === 'rider' ? { expires: expiresAt } : {}),
  };
}

// A cookie that no longer resolves to a session means it timed out or was signed out elsewhere.
export async function loginRedirectPath(): Promise<string> {
  return (await cookies()).has(sessionCookieName) ? '/login?reason=expired' : '/login';
}

async function sessionFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return resolveSession(token, new Date(), getAuthSecret(process.env), sessionStore);
}
