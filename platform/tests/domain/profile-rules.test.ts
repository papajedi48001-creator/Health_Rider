import { expect, test } from 'vitest';
import { parsePasswordChange, parseProfileChanges } from '@/domain/account/profile-rules';

test('accepts a trimmed name and a Thai phone number, normalising spaces and dashes', () => {
  expect(parseProfileChanges({ displayName: '  สมชาย ใจดี ', phone: '081-234 5678' })).toEqual({ displayName: 'สมชาย ใจดี', phone: '0812345678' });
  expect(parseProfileChanges({ phone: '' })).toEqual({ phone: null });
});

test('rejects an empty name, a bad phone and an empty change', () => {
  expect(() => parseProfileChanges({ displayName: ' ' })).toThrow('ต้องระบุชื่อที่แสดง');
  expect(() => parseProfileChanges({ phone: '12345' })).toThrow('เบอร์โทรต้องเป็นตัวเลข');
  expect(() => parseProfileChanges({ role: 'admin' })).toThrow('ไม่มีข้อมูลที่เปลี่ยนแปลง');
});

test('needs the current password and a new one of at least 12 characters that differs', () => {
  expect(parsePasswordChange({ currentPassword: 'old-password-1', newPassword: 'new-password-12' })).toEqual({ currentPassword: 'old-password-1', newPassword: 'new-password-12' });
  expect(() => parsePasswordChange({ newPassword: 'new-password-12' })).toThrow('ต้องกรอกรหัสผ่านปัจจุบัน');
  expect(() => parsePasswordChange({ currentPassword: 'x', newPassword: 'short' })).toThrow('อย่างน้อย 12');
  expect(() => parsePasswordChange({ currentPassword: 'same-password-1', newPassword: 'same-password-1' })).toThrow('ต้องไม่ซ้ำ');
});
