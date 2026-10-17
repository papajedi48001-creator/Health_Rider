import type { UserRole } from '@/auth/roles';
import { parsePhone } from '@/domain/account/profile-rules';
import { employmentCategories, minimumPasswordLength, type EmploymentCategory } from '@/domain/admin/user-rules';
import { DomainError } from '@/domain/errors';

// Roles a person may ask for on the login page; admin and auditor are only ever granted by an admin.
export const registrableRoles = ['pharmacy', 'coordinator', 'rider'] as const satisfies readonly UserRole[];
export type RegistrableRole = (typeof registrableRoles)[number];

export type Registration = { username: string; displayName: string; phone: string | null; role: RegistrableRole; password: string };

export function parseRegistration(value: unknown): Registration {
  const body = (value ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) throw new DomainError('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, จุด, ขีด ยาว 3-100 ตัวอักษร');
  if (!displayName) throw new DomainError('ต้องระบุชื่อ-นามสกุล');
  if (displayName.length > 255) throw new DomainError('ชื่อยาวเกินไป');
  const phone = parsePhone(body.phone);
  if (!phone) throw new DomainError('ต้องระบุเบอร์โทรเพื่อให้ผู้ดูแลระบบติดต่อกลับ');
  if (!(registrableRoles as readonly unknown[]).includes(body.role)) throw new DomainError('ต้องเลือกหน้าที่ที่ต้องการใช้งาน');
  if (typeof body.password !== 'string' || body.password.length < minimumPasswordLength) {
    throw new DomainError(`รหัสผ่านต้องยาวอย่างน้อย ${minimumPasswordLength} ตัวอักษร`);
  }
  if (body.password.length > 200) throw new DomainError('รหัสผ่านยาวเกินไป');
  return { username, displayName, phone, role: body.role as RegistrableRole, password: body.password };
}

export type ApprovalDecision =
  | { decision: 'approve'; role: UserRole; rider?: { employmentCategory: EmploymentCategory } }
  | { decision: 'reject' };

// The admin confirms or changes the role asked for; a rider also needs a rider code and category.
export function parseApproval(value: unknown, roles: readonly UserRole[]): ApprovalDecision {
  const body = (value ?? {}) as Record<string, unknown>;
  if (body.decision === 'reject') return { decision: 'reject' };
  if (body.decision !== 'approve') throw new DomainError('ต้องเลือกอนุมัติหรือไม่อนุมัติ');
  if (!(roles as readonly unknown[]).includes(body.role)) throw new DomainError('บทบาทไม่ถูกต้อง');
  const role = body.role as UserRole;
  if (role !== 'rider') return { decision: 'approve', role };
  // The rider code is always assigned by the server, so any code sent along is ignored.
  if (!(employmentCategories as readonly unknown[]).includes(body.employmentCategory)) throw new DomainError('ต้องเลือกประเภทไรเดอร์');
  return { decision: 'approve', role, rider: { employmentCategory: body.employmentCategory as EmploymentCategory } };
}
