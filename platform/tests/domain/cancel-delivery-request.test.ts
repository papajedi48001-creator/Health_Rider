import { expect, test, vi } from 'vitest';
import { cancelDeliveryRequest } from '@/domain/delivery/cancel-delivery-request';

const pharmacist = { id: 'pharmacy-1', role: 'pharmacy' as const, displayName: 'Pharmacy' };
const storeWith = (found: { cancelledAt: Date | null; latestAttemptStatus: string | null } | null) => ({
  findRequest: async () => found && { id: 'req-1', ...found } as never,
  markCancelled: vi.fn(async () => undefined),
});

test('cancels a job whose medication came back and has not been prepared again', async () => {
  const store = storeWith({ cancelledAt: null, latestAttemptStatus: 'returned' });
  const now = new Date('2026-11-26T13:40:00+07:00');
  await expect(cancelDeliveryRequest('req-1', pharmacist, store, now)).resolves.toMatchObject({ id: 'req-1', cancelledAt: now, latestAttemptStatus: 'returned' });
  expect(store.markCancelled).toHaveBeenCalledWith('req-1', now);
});

test('sends a job with no delivery history to delete instead', async () => {
  for (const latestAttemptStatus of [null, 'prepared']) {
    const store = storeWith({ cancelledAt: null, latestAttemptStatus });
    await expect(cancelDeliveryRequest('req-1', pharmacist, store)).rejects.toThrow('ใช้ปุ่มลบแทน');
    expect(store.markCancelled).not.toHaveBeenCalled();
  }
});

test('refuses a job a rider still has, one waiting for its medication back, or one already cancelled', async () => {
  for (const latestAttemptStatus of ['claimed', 'in_transit', 'return_required', 'delivered']) {
    await expect(cancelDeliveryRequest('req-1', pharmacist, storeWith({ cancelledAt: null, latestAttemptStatus }))).rejects.toThrow('ยกเลิกได้เฉพาะงานที่รับยาคืนแล้ว');
  }
  await expect(cancelDeliveryRequest('req-1', pharmacist, storeWith({ cancelledAt: new Date(), latestAttemptStatus: 'returned' }))).rejects.toThrow('ถูกยกเลิกแล้ว');
  await expect(cancelDeliveryRequest('req-1', pharmacist, storeWith(null))).rejects.toThrow('ไม่พบงานจัดส่งนี้');
});

test('only pharmacy or admin can cancel', async () => {
  await expect(cancelDeliveryRequest('req-1', { id: 'rider-1', role: 'rider', displayName: 'Rider' }, storeWith({ cancelledAt: null, latestAttemptStatus: 'returned' }))).rejects.toThrow();
});
