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
  expect(safeNextPath('/operations?date=2026-10-15')).toBe('/operations?date=2026-10-15');
});

test('refuses paths a browser would turn into another site', () => {
  // Browsers drop tabs and newlines and read a backslash as a slash, so each of these leaves the site.
  for (const next of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\\evil.example', '/x\\..\\/evil', '/%09/x\u0000']) {
    expect(safeNextPath(next)).toBeNull();
  }
});

test('counts failures per key with its own limit', () => {
  const throttle = new LoginThrottle(3);
  for (let failure = 0; failure < 3; failure += 1) throttle.recordFailure('10.0.0.5', 0);
  expect(throttle.isBlocked('10.0.0.5', 1)).toBe(true);
  throttle.reset('10.0.0.5');
  expect(throttle.isBlocked('10.0.0.5', 1)).toBe(false);
});
