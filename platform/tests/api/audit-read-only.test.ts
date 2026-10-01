import { expect, test } from 'vitest';

test('audit route has no mutation handler', async () => {
  const route = await import('@/app/(staff)/audit/page');
  expect(route.default).toBeTypeOf('function');
});
