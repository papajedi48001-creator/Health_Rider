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

test('still records a return after the Thai calendar day of the failed attempt has ended, flagged as late', async () => {
  const failedAt = new Date('2026-11-25T16:52:00+07:00');
  const nextMorning = new Date('2026-11-26T08:50:00+07:00');
  let saved: unknown = null;
  await expect(receiveMedicationReturn('attempt-1', pharmacist, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt }), update: async (record) => { saved = record; return record; },
  }, nextMorning)).resolves.toMatchObject({ status: 'returned', late: true });
  expect(saved).toMatchObject({ id: 'attempt-1', status: 'returned', returnedAt: nextMorning });
});

test('a return on the same Thai day is not late, even across UTC midnight', async () => {
  const failedAt = new Date('2026-11-25T06:30:00+07:00'); // 24 Nov 23:30 UTC
  const sameDayEvening = new Date('2026-11-25T20:00:00+07:00');
  await expect(receiveMedicationReturn('attempt-1', pharmacist, {
    findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt }), update: async (record) => record,
  }, sameDayEvening)).resolves.toMatchObject({ status: 'returned', late: false });
});

test('lets the coordinator confirm a return but not the rider', async () => {
  const store = { findReturnRequiredAttempt: async () => ({ id: 'attempt-1', status: 'return_required', failedAt: new Date() }), update: async (record: unknown) => record };
  await expect(receiveMedicationReturn('attempt-1', { id: 'coordinator-1', role: 'coordinator', displayName: 'Coordinator' }, store)).resolves.toMatchObject({ status: 'returned' });
  await expect(receiveMedicationReturn('attempt-1', { id: 'rider-1', role: 'rider', displayName: 'Rider' }, store)).rejects.toThrow();
});
