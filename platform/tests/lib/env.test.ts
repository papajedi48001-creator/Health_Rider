import { getAuthSecret, getDatabaseUrl } from '@/lib/env';
import { expect, test } from 'vitest';

test('rejects application startup without a Health Rider database URL', () => {
  expect(() => getDatabaseUrl({})).toThrow('DATABASE_URL is required');
});

test('rejects a missing, short or published development auth secret', () => {
  expect(() => getAuthSecret({})).toThrow('AUTH_SECRET is required');
  expect(() => getAuthSecret({ AUTH_SECRET: 'too-short' })).toThrow('at least 32 characters');
  expect(() => getAuthSecret({ AUTH_SECRET: 'development-only-replace-before-production' })).toThrow('at least 32 characters');
  expect(getAuthSecret({ AUTH_SECRET: 'a'.repeat(32) })).toBe('a'.repeat(32));
});
