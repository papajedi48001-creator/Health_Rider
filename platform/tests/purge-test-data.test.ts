import { describe, expect, it } from 'vitest';
import { orderDate } from '../scripts/purge-test-data.mjs';

describe('orderDate', () => {
  it('reads the HOSxP visit number as a Buddhist-year date', () => {
    expect(orderDate('691019235959', new Date('2026-10-25T00:00:00Z'))).toEqual({ date: '2026-10-19', source: 'vn' });
    expect(orderDate('691020000001', new Date('2026-10-01T00:00:00Z'))).toEqual({ date: '2026-10-20', source: 'vn' });
  });

  it('falls back to the Bangkok creation day without a usable visit number', () => {
    expect(orderDate(null, new Date('2026-10-19T17:00:00Z'))).toEqual({ date: '2026-10-20', source: 'created' });
    expect(orderDate('E2E-01M59H4WF5NCV1QQPHF8F3YJGG', new Date('2026-10-19T16:59:59Z'))).toEqual({ date: '2026-10-19', source: 'created' });
    expect(orderDate('691332000000', new Date('2026-10-19T16:59:59Z'))).toEqual({ date: '2026-10-19', source: 'created' });
  });
});
