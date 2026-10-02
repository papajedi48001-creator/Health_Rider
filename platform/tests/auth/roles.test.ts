import { expect, test } from 'vitest';
import { userRoles } from '@/auth/roles';

test('exposes only delivery-operation roles', () => {
  expect(userRoles).toEqual(['pharmacy', 'coordinator', 'rider', 'admin', 'auditor']);
  expect(userRoles).not.toContain('finance');
});
