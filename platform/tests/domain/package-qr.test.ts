import { expect, test } from 'vitest';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import { prepareAttempt } from '@/domain/delivery/prepare-attempt';

test('issues an opaque QR token and stores only its hash', async () => {
  const stored: { tokenHash?: string } = {};
  const token = await issuePackageQr('attempt-1', new Date('2026-10-02T00:00:00.000Z'), {
    create: async (record) => {
      stored.tokenHash = record.tokenHash;
    },
  });

  expect(token).not.toContain('HN');
  expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(stored.tokenHash).toHaveLength(64);
  expect(stored.tokenHash).not.toBe(token);
});

test('lets pharmacy prepare one attempt for a delivery request', async () => {
  const result = await prepareAttempt('request-1', { id: 'pharmacy-1', role: 'pharmacy', displayName: 'เภสัชกร' }, {
    createAttempt: async (record) => record,
  });

  expect(result).toMatchObject({ deliveryRequestId: 'request-1', status: 'prepared' });
});
