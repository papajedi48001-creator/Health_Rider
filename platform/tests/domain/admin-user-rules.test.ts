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
