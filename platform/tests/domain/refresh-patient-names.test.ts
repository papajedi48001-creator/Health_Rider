import { expect, test, vi } from 'vitest';
import { createPatientNameRefresher } from '@/domain/delivery/refresh-patient-names';

const rows = [
  { id: 'r1', hn: '450014298', patientName: 'สมร ศาลารักษ์' },
  { id: 'r2', hn: '450003368', patientName: 'นายประเสริฐ จันทะฝ่าย' },
  { id: 'r3', hn: '490039502', patientName: 'บำเพ็ญ เชิญชม' },
  { id: 'r4', hn: '450014298', patientName: 'สมร ศาลารักษ์' },
];

test('every job saved without a title picks it up from HOSxP, once per server start', async () => {
  const lookup = vi.fn().mockResolvedValue(new Map([['450014298', 'นางสมร ศาลารักษ์'], ['450003368', 'นายประเสริฐ จันทะฝ่าย'], ['490039502', '']]));
  const store = { deliveryRequest: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn().mockResolvedValue({}) } };
  const refresh = createPatientNameRefresher();

  const changed = await refresh(lookup, store);

  expect(lookup).toHaveBeenCalledWith(['450014298', '450003368', '490039502']);
  // Only changed, non-blank names are written.
  expect(store.deliveryRequest.update.mock.calls).toEqual([
    [{ where: { id: 'r1' }, data: { patientName: 'นางสมร ศาลารักษ์' } }],
    [{ where: { id: 'r4' }, data: { patientName: 'นางสมร ศาลารักษ์' } }],
  ]);
  expect(changed).toEqual(new Map([['r1', 'นางสมร ศาลารักษ์'], ['r4', 'นางสมร ศาลารักษ์']]));

  await expect(refresh(lookup, store)).resolves.toEqual(new Map());
  expect(store.deliveryRequest.findMany).toHaveBeenCalledTimes(1);
});

test('two pages opening together share one sweep', async () => {
  const lookup = vi.fn().mockResolvedValue(new Map());
  const store = { deliveryRequest: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn() } };
  const refresh = createPatientNameRefresher();
  await Promise.all([refresh(lookup, store), refresh(lookup, store)]);
  expect(lookup).toHaveBeenCalledTimes(1);
});

test('when HOSxP cannot be reached pages still load, and it is tried again a few minutes later', async () => {
  const lookup = vi.fn().mockRejectedValue(new Error('down'));
  const store = { deliveryRequest: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn() } };
  const refresh = createPatientNameRefresher();
  const start = Date.parse('2026-10-19T03:00:00Z');

  await expect(refresh(lookup, store, start)).resolves.toEqual(new Map());
  await refresh(lookup, store, start + 60_000);
  expect(lookup).toHaveBeenCalledTimes(1);
  await refresh(lookup, store, start + 6 * 60_000);
  expect(lookup).toHaveBeenCalledTimes(2);
  expect(store.deliveryRequest.update).not.toHaveBeenCalled();
});
