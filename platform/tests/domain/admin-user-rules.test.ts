import { expect, test } from 'vitest';
import { parseNewUser, parseUserChanges, parseZone } from '@/domain/admin/user-rules';

test('requires a category for a rider account, ignores any rider code sent because the server assigns it, and a long password for everyone', () => {
  expect(() => parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password' })).toThrow('ประเภทไรเดอร์');
  expect(parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', riderCode: 'MY-OWN', employmentCategory: 'internal' }))
    .toMatchObject({ rider: { employmentCategory: 'internal' } });
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'pharmacy', password: 'short' })).toThrow('อย่างน้อย 12');
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'finance', password: 'long-enough-password' })).toThrow('บทบาทไม่ถูกต้อง');
  expect(parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', riderCode: 'R-9', employmentCategory: 'external' }))
    .toEqual(expect.objectContaining({ rider: { employmentCategory: 'external' } }));
});

test('does not let an admin deactivate or demote their own account', () => {
  expect(() => parseUserChanges({ active: false }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(() => parseUserChanges({ role: 'auditor' }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(parseUserChanges({ active: false }, 'admin-1', 'rider-1')).toEqual({ active: false });
});

test('normalises HOSxP zone codes', () => {
  expect(parseZone({ subdistrictCode: '470907', villageCode: '3', displayName: 'หมู่ 3' })).toEqual({ subdistrictCode: '470907', subdistrictName: null, villageCode: '03', displayName: 'หมู่ 3' });
  expect(() => parseZone({ subdistrictCode: '46', villageCode: '3', displayName: 'x' })).toThrow('6 หลัก');
});

test('staff accounts take a phone and รพ.สต.; riders never have a รพ.สต.', () => {
  expect(parseNewUser({ username: 'nurse.a', displayName: 'พยาบาล', role: 'coordinator', password: 'long-enough-password', phone: '081-234-5678', healthCenter: ' รพ.สต.ปลาโหล ' }))
    .toMatchObject({ phone: '0812345678', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(parseNewUser({ username: 'rider.b', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', employmentCategory: 'internal', healthCenter: 'รพ.สต.ปลาโหล' }))
    .toMatchObject({ healthCenter: null });
  expect(parseUserChanges({ displayName: 'ชื่อใหม่', phone: '', healthCenter: '' }, 'admin-1', 'user-1')).toEqual({ displayName: 'ชื่อใหม่', phone: null, healthCenter: null });
  expect(() => parseUserChanges({ phone: '12345' }, 'admin-1', 'user-1')).toThrow('เบอร์โทร');
});
