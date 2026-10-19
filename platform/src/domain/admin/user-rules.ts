import { userRoles, type UserRole } from '@/auth/roles';
import { parsePhone } from '@/domain/account/profile-rules';
import { DomainError } from '@/domain/errors';

export const minimumPasswordLength = 12;
export const employmentCategories = ['internal', 'external'] as const;
export type EmploymentCategory = (typeof employmentCategories)[number];

export type NewUserInput = {
  username: string;
  displayName: string;
  role: UserRole;
  password: string;
  phone: string | null;
  healthCenter: string | null;
  rider?: { employmentCategory: EmploymentCategory };
};

export type UserChanges = {
  displayName?: string; phone?: string | null; healthCenter?: string | null; role?: UserRole; active?: boolean; password?: string;
};

export function parseNewUser(value: unknown): NewUserInput {
  const body = (value ?? {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  if (!/^[a-z0-9._-]{3,100}$/.test(username)) throw new DomainError('ชื่อผู้ใช้ต้องเป็น a-z, 0-9, จุด, ขีด ยาว 3-100 ตัวอักษร');
  if (!displayName) throw new DomainError('ต้องระบุชื่อที่แสดง');
  const role = parseRole(body.role);
  const password = parsePassword(body.password);
  const phone = parsePhone(body.phone);
  if (role !== 'rider') return { username, displayName, role, password, phone, healthCenter: parseHealthCenter(body.healthCenter) };

  // The rider code is always assigned by the server, so any code sent along is ignored.
  if (!(employmentCategories as readonly unknown[]).includes(body.employmentCategory)) throw new DomainError('ต้องเลือกประเภทไรเดอร์');
  // Only staff belong to a รพ.สต.; riders never have one.
  return { username, displayName, role, password, phone, healthCenter: null, rider: { employmentCategory: body.employmentCategory as EmploymentCategory } };
}

// Admins cannot lock themselves out by deactivating or demoting their own account.
export function parseUserChanges(value: unknown, actorId: string, targetId: string): UserChanges {
  const body = (value ?? {}) as Record<string, unknown>;
  const changes: UserChanges = {};
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== 'string' || !body.displayName.trim()) throw new DomainError('ต้องระบุชื่อที่แสดง');
    changes.displayName = body.displayName.trim();
  }
  if (body.phone !== undefined) changes.phone = parsePhone(body.phone);
  if (body.healthCenter !== undefined) changes.healthCenter = parseHealthCenter(body.healthCenter);
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

// The รพ.สต. name as typed, or null when left blank.
function parseHealthCenter(value: unknown): string | null {
  if (value !== null && value !== undefined && typeof value !== 'string') throw new DomainError('ชื่อ รพ.สต. ไม่ถูกต้อง');
  const name = (value ?? '').trim();
  if (name.length > 255) throw new DomainError('ชื่อ รพ.สต. ยาวเกินไป');
  return name || null;
}

function parseRole(value: unknown): UserRole {
  if (!(userRoles as readonly unknown[]).includes(value)) throw new DomainError('บทบาทไม่ถูกต้อง');
  return value as UserRole;
}

function parsePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < minimumPasswordLength) throw new DomainError(`รหัสผ่านต้องยาวอย่างน้อย ${minimumPasswordLength} ตัวอักษร`);
  return value;
}

export function parseZone(value: unknown): { subdistrictCode: string; subdistrictName: string | null; villageCode: string; displayName: string } {
  const body = (value ?? {}) as Record<string, unknown>;
  const subdistrictCode = typeof body.subdistrictCode === 'string' ? body.subdistrictCode.trim() : '';
  const subdistrictName = typeof body.subdistrictName === 'string' && body.subdistrictName.trim() ? body.subdistrictName.trim() : null;
  const villageCode = typeof body.villageCode === 'string' ? body.villageCode.trim().padStart(2, '0') : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  // HOSxP chwpart+amppart+tmbpart: tmbpart alone repeats across districts.
  if (!/^\d{6}$/.test(subdistrictCode)) throw new DomainError('รหัสตำบลต้องเป็นตัวเลข 6 หลัก (จังหวัด+อำเภอ+ตำบล) ให้ตรงกับ HOSxP');
  if (!/^[0-9A-Za-z]{1,32}$/.test(villageCode)) throw new DomainError('รหัสหมู่บ้านต้องตรงกับ HOSxP');
  if (!displayName) throw new DomainError('ต้องระบุชื่อโซน');
  return { subdistrictCode, subdistrictName, villageCode, displayName };
}
