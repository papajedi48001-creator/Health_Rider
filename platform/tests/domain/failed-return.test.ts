import { expect, test } from 'vitest';
import { receiveMedicationReturn } from '@/domain/delivery/receive-medication-return';

const pharmacist = { id: 'pharmacy-1', role: 'pharmacy' as const, displayName: 'Pharmacy' };

test('requires pharmacy to confirm the same-day medication return before retry', async () => {
  await expect(receiveMedicationReturn('attempt-1', pharmacist, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt: new Date() }), update: async (record) => record,
  })).resolves.toMatchObject({ status: 'returned' });
});

test('rejects a return for an attempt that is not waiting for one', async () => {
  await expect(receiveMedicationReturn('attempt-1', pharmacist, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'in_transit', failedAt: null }), update: async (record) => record,
  })).rejects.toThrow('ไม่พบงานที่รอรับยาคืน');
});

test('rejects a return after the Thai calendar day of the failed attempt has ended', async () => {
  const yesterdayInThailand = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await expect(receiveMedicationReturn('attempt-1', pharmacist, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt: yesterdayInThailand }), update: async (record) => record,
  })).rejects.toThrow('ต้องรับยาคืนภายในวันเดียวกัน');
});
