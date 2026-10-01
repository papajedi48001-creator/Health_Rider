import { getDatabaseUrl } from '@/lib/env';
import { expect, test } from 'vitest';

test('rejects application startup without a Health Rider database URL', () => {
  expect(() => getDatabaseUrl({})).toThrow('DATABASE_URL is required');
});
