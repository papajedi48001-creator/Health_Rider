import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import type { SessionUser } from '@/auth/require-role';
import type { UserRole } from '@/auth/roles';
import { newPublicId } from '@/domain/delivery/status';

export { sessionCookieName } from '@/auth/session-cookie';
export const sessionLifetimeMs = 12 * 60 * 60 * 1000;
// Staff share hospital computers, so an unattended session ends after 30 minutes without activity.
// Riders keep theirs for the whole shift: a job can run for hours offline and must still sync afterwards.
export const staffIdleTimeoutMs = 30 * 60 * 1000;
// Activity is written back at most once a minute, not on every request.
const touchIntervalMs = 60 * 1000;

export function idleTimeoutFor(role: UserRole): number | null {
  return role === 'rider' ? null : staffIdleTimeoutMs;
}

// Compared against when a username does not exist, so a failed login takes the same time either way.
const unknownUserPasswordHash = '$2b$12$GGzk4FZE6DOD9j9WUoo2/uN9LMYjQw4DnabI52HGWTDAtNuKQFKpu';

export type StoredSession = {
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  user: { id: string; role: UserRole; displayName: string; active: boolean; avatarUpdatedAt?: Date | null };
};

export type SessionStore = {
  create(record: { id: string; tokenHash: string; userId: string; expiresAt: Date; lastSeenAt: Date }): Promise<unknown>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  revoke(tokenHash: string, revokedAt: Date): Promise<unknown>;
  touch(tokenHash: string, lastSeenAt: Date): Promise<unknown>;
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
  await store.create({ id: newPublicId(), tokenHash: hashSessionToken(token, secret), userId, expiresAt, lastSeenAt: now });
  return { token, expiresAt };
}

export async function resolveSession(token: string, now: Date, secret: string, store: SessionStore): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token, secret);
  const session = await store.findByTokenHash(tokenHash);
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active) {
    return null;
  }
  const idleLimit = idleTimeoutFor(session.user.role);
  if (idleLimit !== null && now.getTime() - session.lastSeenAt.getTime() >= idleLimit) {
    await store.revoke(tokenHash, now);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() >= touchIntervalMs) await store.touch(tokenHash, now);

  const { id, role, displayName, avatarUpdatedAt } = session.user;
  return { id, role, displayName, ...(avatarUpdatedAt ? { avatarVersion: avatarUpdatedAt.getTime() } : {}) };
}

export async function endSession(token: string, now: Date, secret: string, store: SessionStore): Promise<void> {
  await store.revoke(hashSessionToken(token, secret), now);
}
