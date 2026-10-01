import type { UserRole } from '@/auth/roles';

export type SessionUser = {
  id: string;
  role: UserRole;
  displayName: string;
};

export class UnauthorizedError extends Error {
  constructor() {
    super('ไม่มีสิทธิ์ใช้งานรายการนี้');
  }
}

export function requireRole(session: SessionUser | null, ...roles: UserRole[]): SessionUser {
  if (!session || !roles.includes(session.role)) {
    throw new UnauthorizedError();
  }

  return session;
}
