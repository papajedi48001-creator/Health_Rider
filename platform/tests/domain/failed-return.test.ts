import { expect, test } from 'vitest';
import { recordFailedDelivery } from '@/domain/delivery/record-failed-delivery';
import { receiveMedicationReturn } from '@/domain/delivery/receive-medication-return';

test('requires a standard reason and moves a claimed attempt to return_required', async () => {
  await expect(recordFailedDelivery('attempt-1', { reason: 'recipient_unavailable' }, { id: 'rider-1', role: 'rider', displayName: 'Rider' }, {
    findClaimedAttempt: async () => ({ id: 'attempt-1', status: 'claimed' }), update: async (record) => record,
  })).resolves.toMatchObject({ status: 'return_required', failureReason: 'recipient_unavailable' });
});

test('requires pharmacy to confirm the same-day medication return before retry', async () => {
  await expect(receiveMedicationReturn('attempt-1', { id: 'pharmacy-1', role: 'pharmacy', displayName: 'Pharmacy' }, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt: new Date() }), update: async (record) => record,
  })).resolves.toMatchObject({ status: 'returned' });
});

test('rejects a return after the Thai calendar day of the failed attempt has ended', async () => {
  const yesterdayInThailand = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await expect(receiveMedicationReturn('attempt-1', { id: 'pharmacy-1', role: 'pharmacy', displayName: 'Pharmacy' }, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt: yesterdayInThailand }), update: async (record) => record,
  })).rejects.toThrow('ต้องรับยาคืนภายในวันเดียวกัน');
});
