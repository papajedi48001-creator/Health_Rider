import { expect, test } from 'vitest';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { hashPassword, verifyPassword } from '@/auth/session';

test('rejects a session without a permitted role', () => {
  expect(() => requireRole({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' }, 'pharmacy')).toThrow(
    UnauthorizedError,
  );
});

test('accepts an explicitly permitted role', () => {
  expect(requireRole({ id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, 'pharmacy').id).toBe(
    'pharmacy-1',
  );
});

test('verifies a password only against its bcrypt hash', async () => {
  const passwordHash = await hashPassword('test-only-password');

  await expect(verifyPassword('test-only-password', passwordHash)).resolves.toBe(true);
  await expect(verifyPassword('wrong-password', passwordHash)).resolves.toBe(false);
});
