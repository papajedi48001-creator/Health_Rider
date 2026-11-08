import { expect, test } from 'vitest';
import { parseNewUser, parseUserChanges, parseZone } from '@/domain/admin/user-rules';
import { parseRoleSet } from '@/domain/admin/user-roles';

test('requires a category for a rider account, ignores any rider code sent because the server assigns it, and a long password for everyone', () => {
  expect(() => parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', healthCenter: 'รพ.สต.คำบิด' })).toThrow('ประเภทไรเดอร์');
  expect(parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', healthCenter: 'รพ.สต.คำบิด', riderCode: 'MY-OWN', employmentCategory: 'internal' }))
    .toMatchObject({ rider: { employmentCategory: 'internal' } });
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'pharmacy', password: 'short', healthCenter: 'รพ.สต.คำบิด' })).toThrow('อย่างน้อย 12');
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'finance', password: 'long-enough-password', healthCenter: 'รพ.สต.คำบิด' })).toThrow('บทบาทไม่ถูกต้อง');
  expect(parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', healthCenter: 'รพ.สต.คำบิด', riderCode: 'R-9', employmentCategory: 'external' }))
    .toEqual(expect.objectContaining({ rider: { employmentCategory: 'external' } }));
});

test('does not let an admin deactivate or demote their own account', () => {
  expect(() => parseUserChanges({ active: false }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(() => parseRoleSet({ roles: ['auditor'] }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(parseUserChanges({ active: false }, 'admin-1', 'rider-1')).toEqual({ active: false });
});

test('normalises HOSxP zone codes', () => {
  expect(parseZone({ subdistrictCode: '470907', villageCode: '3', displayName: 'หมู่ 3' })).toEqual({ subdistrictCode: '470907', subdistrictName: null, villageCode: '03', displayName: 'หมู่ 3' });
  expect(() => parseZone({ subdistrictCode: '46', villageCode: '3', displayName: 'x' })).toThrow('6 หลัก');
});

test('every account takes a phone and a รพ.สต.', () => {
  expect(parseNewUser({ username: 'nurse.a', displayName: 'พยาบาล', role: 'coordinator', password: 'long-enough-password', phone: '081-234-5678', healthCenter: ' รพ.สต.ปลาโหล ' }))
    .toMatchObject({ phone: '0812345678', healthCenter: 'รพ.สต.ปลาโหล' });
  expect(parseNewUser({ username: 'rider.b', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', employmentCategory: 'internal', healthCenter: 'รพ.สต.ปลาโหล' }))
    .toMatchObject({ healthCenter: 'รพ.สต.ปลาโหล' });
  expect(() => parseNewUser({ username: 'rider.c', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', employmentCategory: 'internal' })).toThrow('ต้องเลือก รพ.สต.');
  expect(parseUserChanges({ displayName: 'ชื่อใหม่', phone: '', healthCenter: 'PCU รพ.วาริชภูมิ' }, 'admin-1', 'user-1')).toEqual({ displayName: 'ชื่อใหม่', phone: null, healthCenter: 'PCU รพ.วาริชภูมิ' });
  expect(() => parseUserChanges({ healthCenter: '' }, 'admin-1', 'user-1')).toThrow('ต้องเลือก รพ.สต.');
  expect(() => parseUserChanges({ phone: '12345' }, 'admin-1', 'user-1')).toThrow('เบอร์โทร');
});
