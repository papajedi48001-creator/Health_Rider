import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import type { SessionUser } from '@/auth/require-role';
import { userRoles, type UserRole } from '@/auth/roles';
import { newPublicId } from '@/domain/delivery/status';

export { sessionCookieName } from '@/auth/session-cookie';
export const sessionLifetimeMs = 12 * 60 * 60 * 1000;
// Staff share hospital computers, so an unattended session ends after 30 minutes without activity.
// Riders keep theirs for the whole shift: a job can run for hours offline and must still sync afterwards.
export const staffIdleTimeoutMs = 30 * 60 * 1000;
// Activity is written back at most once a minute, not on every request.
const touchIntervalMs = 60 * 1000;

export function idleTimeoutFor(role: UserRole | null): number | null {
  return role === 'rider' ? null : staffIdleTimeoutMs;
}

// Compared against when a username does not exist, so a failed login takes the same time either way.
const unknownUserPasswordHash = '$2b$12$GGzk4FZE6DOD9j9WUoo2/uN9LMYjQw4DnabI52HGWTDAtNuKQFKpu';

export type StoredSession = {
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  activeRole?: UserRole | null;
  user: {
    id: string; role: UserRole; displayName: string; active: boolean; avatarUpdatedAt?: Date | null; mustChangePassword?: boolean; healthCenter?: string | null;
    roleGrants?: Array<{ role: UserRole }>;
  };
};

export type SessionStore = {
  create(record: { id: string; tokenHash: string; userId: string; expiresAt: Date; lastSeenAt: Date }): Promise<unknown>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | null>;
  revoke(tokenHash: string, revokedAt: Date): Promise<unknown>;
  touch(tokenHash: string, lastSeenAt: Date): Promise<unknown>;
  setActiveRole?(tokenHash: string, role: UserRole): Promise<unknown>;
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

// Ended sessions are kept this long for investigation, then deleted so the table does not grow forever.
const endedSessionRetentionMs = 30 * 24 * 60 * 60 * 1000;

export function endedSessionCutoff(now: Date): Date {
  return new Date(now.getTime() - endedSessionRetentionMs);
}

export async function startSession(userId: string, now: Date, secret: string, store: SessionStore): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + sessionLifetimeMs);
  await store.create({ id: newPublicId(), tokenHash: hashSessionToken(token, secret), userId, expiresAt, lastSeenAt: now });
  return { token, expiresAt };
}

// The roles an account holds, in the usual order; an account saved before roles were separate holds just its own.
export function heldRoles(user: { role: UserRole; roleGrants?: Array<{ role: UserRole }> }): UserRole[] {
  const granted = user.roleGrants?.map((grant) => grant.role) ?? [user.role];
  return userRoles.filter((role) => granted.includes(role));
}

// The role this sign-in works in: the one picked, or the only one held. Null while a choice is still owed,
// including when the picked role has since been taken away and more than one remains.
export function workingRole(activeRole: UserRole | null | undefined, roles: readonly UserRole[]): UserRole | null {
  if (activeRole && roles.includes(activeRole)) return activeRole;
  return roles.length === 1 ? roles[0] : null;
}

export async function resolveSession(token: string, now: Date, secret: string, store: SessionStore): Promise<SessionUser | null> {
  const tokenHash = hashSessionToken(token, secret);
  const session = await store.findByTokenHash(tokenHash);
  if (!session || session.revokedAt || session.expiresAt <= now || !session.user.active) {
    return null;
  }
  const roles = heldRoles(session.user);
  if (roles.length === 0) return null;
  const role = workingRole(session.activeRole, roles);
  const idleLimit = idleTimeoutFor(role);
  if (idleLimit !== null && now.getTime() - session.lastSeenAt.getTime() >= idleLimit) {
    await store.revoke(tokenHash, now);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() >= touchIntervalMs) await store.touch(tokenHash, now);

  const { id, displayName, avatarUpdatedAt, mustChangePassword, healthCenter } = session.user;
  return {
    id, role: role ?? roles[0], displayName,
    ...(roles.length > 1 ? { roles } : {}),
    ...(role === null ? { roleChoicePending: true } : {}),
    ...(avatarUpdatedAt ? { avatarVersion: avatarUpdatedAt.getTime() } : {}),
    ...(mustChangePassword ? { mustChangePassword } : {}),
    ...(role === 'coordinator' ? { healthCenter: healthCenter ?? null } : {}),
  };
}

// Records which of the account's roles this sign-in works in.
export async function chooseSessionRole(token: string, role: UserRole, secret: string, store: SessionStore): Promise<void> {
  if (!store.setActiveRole) throw new Error('This session store cannot record a role');
  await store.setActiveRole(hashSessionToken(token, secret), role);
}

export async function endSession(token: string, now: Date, secret: string, store: SessionStore): Promise<void> {
  await store.revoke(hashSessionToken(token, secret), now);
}
