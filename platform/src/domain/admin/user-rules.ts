import { userRoles, type UserRole } from '@/auth/roles';
import { DomainError } from '@/domain/errors';

export const minimumPasswordLength = 12;
export const employmentCategories = ['internal', 'external'] as const;
export type EmploymentCategory = (typeof employmentCategories)[number];

export type NewUserInput = {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
  rider?: { riderCode: string; employmentCategory: EmploymentCategory };
};

export type UserChanges = { displayName?: string; role?: UserRole; active?: boolean; password?: string };

export function parseNewUser(value: unknown): NewUserInput {
  const body = (value ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) throw new DomainError('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, จุด, ขีด ยาว 3-100 ตัวอักษร');
  if (!displayName) throw new DomainError('ต้องระบุชื่อที่แสดง');
  const role = parseRole(body.role);
  const password = parsePassword(body.password);
  if (role !== 'rider') return { username, displayName, role, password };

  const riderCode = typeof body.riderCode === 'string' ? body.riderCode.trim() : '';
  if (!riderCode) throw new DomainError('ไรเดอร์ต้องมีรหัสไรเดอร์');
  if (!(employmentCategories as readonly unknown[]).includes(body.employmentCategory)) throw new DomainError('ต้องเลือกประเภทไรเดอร์');
  return { username, displayName, role, password, rider: { riderCode, employmentCategory: body.employmentCategory as EmploymentCategory } };
}

// Admins cannot lock themselves out by deactivating or demoting their own account.
export function parseUserChanges(value: unknown, actorId: string, targetId: string): UserChanges {
  const body = (value ?? {}) as Record<string, unknown>;
  const changes: UserChanges = {};
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) throw new DomainError('ต้องระบุชื่อที่แสดง');
    changes.displayName = body.displayName.trim();
  }
  if (body.role !== undefined) changes.role = parseRole(body.role);
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new DomainError('สถานะบัญชีไม่ถูกต้อง');
    changes.active = body.active;
  }
  if (body.password !== undefined) changes.password = parsePassword(body.password);
  if (actorId === targetId && (changes.active === false || (changes.role && changes.role !== 'admin'))) {
    throw new DomainError('ปิดหรือลดสิทธิ์บัญชีของตัวเองไม่ได้');
  }
  if (Object.keys(changes).length === 0) throw new DomainError('ไม่มีข้อมูลที่เปลี่ยนแปลง');
  return changes;
}

function parseRole(value: unknown): UserRole {
  if (!(userRoles as readonly unknown[]).includes(value)) throw new DomainError('บทบาทไม่ถูกต้อง');
  return value as UserRole;
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < minimumPasswordLength) throw new DomainError(`รหัสผ่านต้องยาวอย่างน้อย ${minimumPasswordLength} ตัวอักษร`);
  return value;
}

export function parseZone(value: unknown): { subdistrictCode: string; villageCode: string; displayName: string } {
  const body = (value ?? {}) as Record<string, unknown>;
  const subdistrictCode = typeof body.subdistrictCode === 'string' ? body.subdistrictCode.trim() : '';
  const villageCode = typeof body.villageCode === 'string' ? body.villageCode.trim().padStart(2, '0') : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  // HOSxP chwpart+amppart+tmbpart: tmbpart alone repeats across districts.
  if (!/^\d{6}$/.test(subdistrictCode)) throw new DomainError('รหัสตำบลต้องเป็นตัวเลข 6 หลัก (จังหวัด+อำเภอ+ตำบล) ให้ตรงกับ HOS');
  if (!/^[0-9A-Za-z]{1,32}$/.test(villageCode)) throw new DomainError('รหัสหมู่บ้านต้องตรงกับ HOS');
  if (!displayName) throw new DomainError('ต้องระบุชื่อโซน');
  return { subdistrictCode, villageCode, displayName };
}
