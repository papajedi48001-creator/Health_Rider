import { expect, test } from 'vitest';
import { menuRole } from '@/auth/view-as';

test('an admin sees the menu of the role they picked', () => {
  expect(menuRole('admin', 'pharmacy')).toBe('pharmacy');
  expect(menuRole('admin', 'coordinator')).toBe('coordinator');
  expect(menuRole('admin', 'rider')).toBe('rider');
  expect(menuRole('admin', undefined)).toBe('admin');
  expect(menuRole('admin', 'auditor')).toBe('admin');
});

test('anyone else always sees their own menu, whatever the cookie says', () => {
  expect(menuRole('pharmacy', 'admin')).toBe('pharmacy');
  expect(menuRole('rider', 'coordinator')).toBe('rider');
});
