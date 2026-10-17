import { expect, test } from 'vitest';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import { prepareAttempt, type PreparedAttempt } from '@/domain/delivery/prepare-attempt';
import { reissuePackageQr } from '@/domain/delivery/reissue-package-qr';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

test('issues an opaque QR token and stores only its hash', async () => {
  const stored: { tokenHash?: string } = {};
  const token = await issuePackageQr('attempt-1', new Date('2026-10-02T00:00:00.000Z'), {
    create: async (record) => {
      stored.tokenHash = record.tokenHash;
    },
  });

  // The token is random; it must not carry the attempt id or anything else readable. (Checking for "HN" failed whenever the random text happened to contain those two letters.)
  expect(token).not.toContain('attempt-1');
  expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(stored.tokenHash).toHaveLength(64);
  expect(stored.tokenHash).not.toBe(token);
});

const pharmacist = { id: 'pharmacy-1', role: 'pharmacy' as const, displayName: 'เภสัชกร' };

test('lets pharmacy prepare one attempt for a delivery request', async () => {
  const result = await prepareAttempt('request-1', pharmacist, {
    findRequest: async (id) => ({ id, latestAttemptStatus: null }),
    createAttempt: async (record) => record,
  });

  expect(result).toMatchObject({ deliveryRequestId: 'request-1', status: 'prepared' });
});

test('prepares a retry only after the previous package was returned', async () => {
  const store = (latestAttemptStatus: DeliveryAttemptStatus) => ({
    findRequest: async (id: string) => ({ id, latestAttemptStatus }),
    createAttempt: async (record: PreparedAttempt) => record,
  });

  await expect(prepareAttempt('request-1', pharmacist, store('returned'))).resolves.toMatchObject({ status: 'prepared' });
  for (const status of ['prepared', 'in_transit', 'return_required', 'delivered'] as const) {
    await expect(prepareAttempt('request-1', pharmacist, store(status))).rejects.toThrow('ต้องรับยาคืนก่อนเตรียมพัสดุใหม่');
  }
});

test('reissues a QR only for a package no rider has claimed', async () => {
  const invalidated: string[] = [];
  const store = (status: DeliveryAttemptStatus) => ({
    findAttempt: async (id: string) => ({ id, status }),
    invalidateTokens: async (id: string) => { invalidated.push(id); },
    createToken: async () => undefined,
  });

  await expect(reissuePackageQr('attempt-1', new Date(), pharmacist, store('prepared'))).resolves.toMatch(/^[A-Za-z0-9_-]{40,}$/);
  expect(invalidated).toEqual(['attempt-1']);
  await expect(reissuePackageQr('attempt-2', new Date(), pharmacist, store('claimed'))).rejects.toThrow('ออก QR ใหม่ได้เฉพาะ');
});
