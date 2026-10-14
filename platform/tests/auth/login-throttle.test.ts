import { expect, test } from 'vitest';
import { LoginThrottle } from '@/auth/login-throttle';
import { safeNextPath } from '@/auth/role-home';

test('blocks a username after ten failures until the window passes', () => {
  const throttle = new LoginThrottle();
  for (let failure = 0; failure < 10; failure += 1) throttle.recordFailure('rider.uat', 0);

  expect(throttle.isBlocked('rider.uat', 1_000)).toBe(true);
  expect(throttle.isBlocked('other.user', 1_000)).toBe(false);
  expect(throttle.isBlocked('rider.uat', 15 * 60 * 1000)).toBe(false);
});

test('accepts only same-site relative paths after login', () => {
  expect(safeNextPath('/rider/scan')).toBe('/rider/scan');
  expect(safeNextPath('//evil.example')).toBeNull();
  expect(safeNextPath('https://evil.example')).toBeNull();
  expect(safeNextPath(undefined)).toBeNull();
});
