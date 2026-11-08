import { expect, test } from 'vitest';
import { filterUsers, noHealthCenterFilter } from '@/domain/admin/user-filters';
import { parseRoleRequest, parseRoleRequestDecision, parseRoleSet, primaryRole } from '@/domain/admin/user-roles';

test('an admin gives a set of valid roles, at least one, and keeps admin on their own account', () => {
  expect(parseRoleSet({ roles: ['rider', 'pharmacy', 'rider'] }, 'admin-1', 'user-1')).toEqual({ roles: ['pharmacy', 'rider'] });
  expect(parseRoleSet({ roles: ['rider'], employmentCategory: 'external' }, 'admin-1', 'user-1')).toEqual({ roles: ['rider'], rider: { employmentCategory: 'external' } });
  expect(() => parseRoleSet({ roles: [] }, 'admin-1', 'user-1')).toThrow('อย่างน้อยหนึ่งบทบาท');
  expect(() => parseRoleSet({ roles: ['finance'] }, 'admin-1', 'user-1')).toThrow('บทบาทไม่ถูกต้อง');
  expect(() => parseRoleSet({ roles: 'admin' }, 'admin-1', 'user-1')).toThrow('บทบาทไม่ถูกต้อง');
  expect(() => parseRoleSet({ roles: ['pharmacy'] }, 'admin-1', 'admin-1')).toThrow('ของตัวเองไม่ได้');
  expect(parseRoleSet({ roles: ['admin', 'pharmacy'] }, 'admin-1', 'admin-1')).toEqual({ roles: ['pharmacy', 'admin'] });
});

test('a user asks only for a role they do not hold and have not already asked for', () => {
  expect(parseRoleRequest({ role: 'pharmacy', reason: '  ช่วยงานห้องยา ' }, ['rider'], [])).toEqual({ role: 'pharmacy', reason: 'ช่วยงานห้องยา' });
  expect(parseRoleRequest({ role: 'pharmacy', reason: '' }, ['rider'], [])).toEqual({ role: 'pharmacy', reason: null });
  expect(() => parseRoleRequest({ role: 'rider' }, ['rider'], [])).toThrow('มีบทบาทนี้อยู่แล้ว');
  expect(() => parseRoleRequest({ role: 'pharmacy' }, ['rider'], ['pharmacy'])).toThrow('ส่งคำขอบทบาทนี้ไว้แล้ว');
  expect(() => parseRoleRequest({ role: 'boss' }, ['rider'], [])).toThrow('ต้องเลือกบทบาท');
  expect(() => parseRoleRequest({ role: 'pharmacy', reason: 'x'.repeat(501) }, ['rider'], [])).toThrow('500');
});

test('a role request decision is approve, with a rider category when needed, or reject', () => {
  expect(parseRoleRequestDecision({ decision: 'reject' })).toEqual({ decision: 'reject' });
  expect(parseRoleRequestDecision({ decision: 'approve' })).toEqual({ decision: 'approve' });
  expect(parseRoleRequestDecision({ decision: 'approve', employmentCategory: 'internal' })).toEqual({ decision: 'approve', rider: { employmentCategory: 'internal' } });
  expect(() => parseRoleRequestDecision({ decision: 'approve', employmentCategory: 'boss' })).toThrow('ประเภทไรเดอร์');
  expect(() => parseRoleRequestDecision({})).toThrow('อนุมัติ');
});

test('the role shown first stays while it is still held', () => {
  expect(primaryRole('rider', ['pharmacy', 'rider'])).toBe('rider');
  expect(primaryRole('rider', ['pharmacy', 'coordinator'])).toBe('pharmacy');
});

test('filters users by รพ.สต., role and a search over name, username, phone and rider code', () => {
  const users = [
    { username: 'somchai', displayName: 'สมชาย ใจดี', healthCenter: 'รพ.สต.ปลาโหล', phone: '0811111111', roles: ['rider' as const], riderProfile: { riderCode: 'INT-001' } },
    { username: 'suda', displayName: 'สุดา รักงาน', healthCenter: 'รพ.สต.คำบิด', phone: null, roles: ['pharmacy' as const, 'coordinator' as const], riderProfile: null },
    { username: 'new.one', displayName: 'ยังไม่มีที่', healthCenter: null, roles: ['coordinator' as const] },
  ];
  const names = (filters: Partial<Parameters<typeof filterUsers>[1]>) => filterUsers(users, { healthCenter: '', role: '', q: '', ...filters }).map((user) => user.username);

  expect(names({})).toEqual(['somchai', 'suda', 'new.one']);
  expect(names({ healthCenter: 'รพ.สต.คำบิด' })).toEqual(['suda']);
  expect(names({ healthCenter: noHealthCenterFilter })).toEqual(['new.one']);
  expect(names({ role: 'coordinator' })).toEqual(['suda', 'new.one']);
  expect(names({ q: 'สุดา' })).toEqual(['suda']);
  expect(names({ q: 'int-001' })).toEqual(['somchai']);
  expect(names({ q: '081111' })).toEqual(['somchai']);
  expect(names({ role: 'coordinator', healthCenter: 'รพ.สต.ปลาโหล' })).toEqual([]);
});
