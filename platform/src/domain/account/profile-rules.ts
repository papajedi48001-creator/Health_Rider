import { minimumPasswordLength } from '@/domain/admin/user-rules';
import { DomainError } from '@/domain/errors';

export type ProfileChanges = { displayName?: string; phone?: string | null };

// Users edit only their own name and phone; username, role and rider code stay with the admin.
export function parseProfileChanges(value: unknown): ProfileChanges {
  const body = (value ?? {}) as Record<string, unknown>;
  const changes: ProfileChanges = {};
  if (body.displayName !== undefined) {
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    if (!displayName) throw new DomainError('ต้องระบุชื่อที่แสดง');
    if (displayName.length > 255) throw new DomainError('ชื่อที่แสดงยาวเกินไป');
    changes.displayName = displayName;
  }
  if (body.phone !== undefined) {
    if (body.phone !== null && typeof body.phone !== 'string') throw new DomainError('เบอร์โทรไม่ถูกต้อง');
    const phone = (body.phone ?? '').replace(/[\s-]/g, '');
    if (phone && !/^0\d{8,9}$/.test(phone)) throw new DomainError('เบอร์โทรต้องเป็นตัวเลข 9-10 หลัก ขึ้นต้นด้วย 0');
    changes.phone = phone || null;
  }
  if (Object.keys(changes).length === 0) throw new DomainError('ไม่มีข้อมูลที่เปลี่ยนแปลง');
  return changes;
}

export function parsePasswordChange(value: unknown): { currentPassword: string; newPassword: string } {
  const body = (value ?? {}) as Record<string, unknown>;
  if (typeof body.currentPassword !== 'string' || !body.currentPassword) throw new DomainError('ต้องกรอกรหัสผ่านปัจจุบัน');
  if (typeof body.newPassword !== 'string' || body.newPassword.length < minimumPasswordLength) {
    throw new DomainError(`รหัสผ่านใหม่ต้องยาวอย่างน้อย ${minimumPasswordLength} ตัวอักษร`);
  }
  if (body.newPassword === body.currentPassword) throw new DomainError('รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม');
  return { currentPassword: body.currentPassword, newPassword: body.newPassword };
}
