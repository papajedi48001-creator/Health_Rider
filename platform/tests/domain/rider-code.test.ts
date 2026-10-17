import { expect, test } from 'vitest';
import { nextRiderCode } from '@/domain/admin/rider-code';

test('numbers rider codes per category after the highest existing one', () => {
  expect(nextRiderCode('internal', [])).toBe('INT-001');
  expect(nextRiderCode('internal', ['INT-001', 'INT-012', 'EXT-050', 'UAT-INT-01', 'INT-x'])).toBe('INT-013');
  expect(nextRiderCode('external', ['EXT-999'])).toBe('EXT-1000');
});
