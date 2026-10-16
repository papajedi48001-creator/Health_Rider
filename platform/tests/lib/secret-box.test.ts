import { expect, test } from 'vitest';
import { openSecret, sealSecret } from '@/lib/secret-box';

const secret = 'a'.repeat(48);

test('seals a secret so it reads back only with the same AUTH_SECRET', () => {
  const sealed = sealSecret('รหัส-HOSxP', secret);
  expect(sealed).toMatch(/^v1:/);
  expect(sealed).not.toContain('รหัส');
  expect(openSecret(sealed, secret)).toBe('รหัส-HOSxP');
  expect(openSecret(sealed, 'b'.repeat(48))).toBeNull();
  expect(openSecret('v1:broken', secret)).toBeNull();
  expect(sealSecret('same', secret)).not.toBe(sealSecret('same', secret));
});
