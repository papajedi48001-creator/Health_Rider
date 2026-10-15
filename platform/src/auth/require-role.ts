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

// No session at all, or one that has expired: the browser should send the person back to login.
export class UnauthenticatedError extends UnauthorizedError {
  constructor() {
    super();
    this.message = 'หมดเวลาใช้งาน กรุณาเข้าสู่ระบบใหม่';
  }
}

export function requireRole(session: SessionUser | null, ...roles: UserRole[]): SessionUser {
  if (!session) throw new UnauthenticatedError();
  if (!roles.includes(session.role)) {
    throw new UnauthorizedError();
  }

  return session;
}
