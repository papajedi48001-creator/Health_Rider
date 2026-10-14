import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { SessionUser } from '@/auth/require-role';
import { resolveSession, sessionCookieName, type SessionStore } from '@/auth/session';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';

export const sessionStore: SessionStore = {
  create: (record) => db.session.create({ data: record }),
  findByTokenHash: (tokenHash) => db.session.findUnique({
    where: { tokenHash },
    select: { expiresAt: true, revokedAt: true, user: { select: { id: true, role: true, displayName: true, active: true } } },
  }),
  revoke: (tokenHash, revokedAt) => db.session.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt } }),
};

export async function getSessionFromRequest(request: NextRequest): Promise<SessionUser | null> {
  return sessionFromToken(request.cookies.get(sessionCookieName)?.value);
}

export async function getSessionFromCookies(): Promise<SessionUser | null> {
  return sessionFromToken((await cookies()).get(sessionCookieName)?.value);
}

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_INSECURE !== 'true',
    path: '/',
    expires: expiresAt,
  };
}

async function sessionFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  return resolveSession(token, new Date(), getAuthSecret(process.env), sessionStore);
}
