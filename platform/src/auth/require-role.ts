import type { UserRole } from '@/auth/roles';

export type SessionUser = {
  id: string;
  // The role this sign-in works in; every permission check reads it.
  role: UserRole;
  // Every role the account holds, present only when there is more than one to switch between.
  roles?: UserRole[];
  // The account holds several roles and has not picked one yet; nothing but the role choice is allowed.
  roleChoicePending?: boolean;
  displayName: string;
  // Present once the user has uploaded a profile photo; changes whenever they replace it.
  avatarVersion?: number;
  // The password was set by an admin and must be replaced before anything else.
  mustChangePassword?: boolean;
  // The user's รพ.สต.; a coordinator sees only the work of riders from the same one.
  healthCenter?: string | null;
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

export class RoleChoiceRequiredError extends UnauthorizedError {
  constructor() {
    super();
    this.message = 'กรุณาเลือกบทบาทก่อนใช้งาน';
  }
}

export function requireRole(session: SessionUser | null, ...roles: UserRole[]): SessionUser {
  if (!session) throw new UnauthenticatedError();
  if (session.roleChoicePending) throw new RoleChoiceRequiredError();
  if (!roles.includes(session.role)) {
    throw new UnauthorizedError();
  }

  return session;
}
