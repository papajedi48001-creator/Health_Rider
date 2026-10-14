import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import type { SessionUser } from '@/auth/require-role';
import type { UserRole } from '@/auth/roles';
import { newPublicId } from '@/domain/delivery/status';

export { sessionCookieName } from '@/auth/session-cookie';
export const sessionLifetimeMs = 12 * 60 * 60 * 1000;

// Compared against when a username does not exist, so a failed login takes the same time either way.
const unknownUserPasswordHash = '$2b$12$GGzk4FZE6DOD9j9WUoo2/uN9LMYjQw4DnabI52HGWTDAtNuKQFKpu';

export type StoredSession = {
  expiresAt: Date;
  revokedAt: Date | null;
  user: { id: string; role: UserRole; displayName: string; active: boolean };
};

export type SessionStore = {
  create(record: { id: string; tokenHash: string; userId: string; expiresAt: Date }): Promise<unknown>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  revoke(tokenHash: string, revokedAt: Date): Promise<unknown>;
};

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function verifyLoginPassword(password: string, passwordHash: string | null): Promise<boolean> {
  const matches = await verifyPassword(password, passwordHash ?? unknownUserPasswordHash);
  return passwordHash !== null && matches;
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('hex');
}

export async function startSession(userId: string, now: Date, secret: string, store: SessionStore): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + sessionLifetimeMs);
  await store.create({ id: newPublicId(), tokenHash: hashSessionToken(token, secret), userId, expiresAt });
  return { token, expiresAt };
}

export async function resolveSession(token: string, now: Date, secret: string, store: SessionStore): Promise<SessionUser | null> {
  const session = await store.findByTokenHash(hashSessionToken(token, secret));
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active) {
    return null;
  }

  return { id: session.user.id, role: session.user.role, displayName: session.user.displayName };
}

export async function endSession(token: string, now: Date, secret: string, store: SessionStore): Promise<void> {
  await store.revoke(hashSessionToken(token, secret), now);
}
