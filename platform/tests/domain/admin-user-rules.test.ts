import { expect, test } from 'vitest';
import { parseNewUser, parseUserChanges, parseZone } from '@/domain/admin/user-rules';

test('requires a rider code and category for a rider account and a long password for everyone', () => {
  expect(() => parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password' })).toThrow('รหัสไรเดอร์');
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'pharmacy', password: 'short' })).toThrow('อย่างน้อย 12');
  expect(() => parseNewUser({ username: 'pharm.new', displayName: 'เภสัช', role: 'finance', password: 'long-enough-password' })).toThrow('บทบาทไม่ถูกต้อง');
  expect(parseNewUser({ username: 'rider.new', displayName: 'ไรเดอร์', role: 'rider', password: 'long-enough-password', riderCode: 'R-9', employmentCategory: 'external' }))
    .toMatchObject({ rider: { riderCode: 'R-9', employmentCategory: 'external' } });
});

test('does not let an admin deactivate or demote their own account', () => {
  expect(() => parseUserChanges({ active: false }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(() => parseUserChanges({ role: 'auditor' }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(parseUserChanges({ active: false }, 'admin-1', 'rider-1')).toEqual({ active: false });
});

test('normalises HOS zone codes', () => {
  expect(parseZone({ subdistrictCode: '470907', villageCode: '3', displayName: 'หมู่ 3' })).toEqual({ subdistrictCode: '470907', subdistrictName: null, villageCode: '03', displayName: 'หมู่ 3' });
  expect(() => parseZone({ subdistrictCode: '46', villageCode: '3', displayName: 'x' })).toThrow('6 หลัก');
});
