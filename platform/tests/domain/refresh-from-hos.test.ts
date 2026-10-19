import { expect, test, vi } from 'vitest';
import { createJobRefresher } from '@/domain/delivery/refresh-from-hos';

const zone2 = { subdistrictCode: '470602', villageCode: '02' };
const zone9 = { subdistrictCode: '470602', villageCode: '09' };
const rows = [
  { id: 'r1', hn: '450014298', patientName: 'สมร ศาลารักษ์', deliveryAddress: '154 หมู่ 2 ต.ปลาโหล', deliveryZone: zone2 },
  { id: 'r2', hn: '450003368', patientName: 'นายประเสริฐ จันทะฝ่าย', deliveryAddress: '9 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล', deliveryZone: zone9 },
  { id: 'r3', hn: '490039502', patientName: 'บำเพ็ญ เชิญชม', deliveryAddress: '1 หมู่ 9 ต.ปลาโหล', deliveryZone: zone9 },
];
const hosWith = (names: Map<string, string>, villages = new Map([['470602/02', 'จิ๋ว'], ['470602/09', 'ดงเชียงเครือ']])) => {
  const hos = { patientNames: vi.fn().mockResolvedValue(names), villageNames: vi.fn().mockResolvedValue(villages) };
  return { hos, open: vi.fn().mockResolvedValue(hos) };
};
const zones = [
  { id: 'z2', ...zone2, displayName: 'หมู่ 2 ต.ปลาโหล' },
  { id: 'z9', ...zone9, displayName: 'หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' },
];
const storeWith = () => ({
  deliveryRequest: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn().mockResolvedValue({}) },
  deliveryZone: { findMany: vi.fn().mockResolvedValue(zones), update: vi.fn().mockResolvedValue({}) },
});

test('every job picks up its name title and village name from HOSxP, once per server start', async () => {
  const { hos, open } = hosWith(new Map([['450014298', 'นางสมร ศาลารักษ์'], ['450003368', 'นายประเสริฐ จันทะฝ่าย'], ['490039502', '']]));
  const store = storeWith();
  const refresh = createJobRefresher();

  const changed = await refresh(open, store);

  expect(hos.patientNames).toHaveBeenCalledWith(['450014298', '450003368', '490039502']);
  // Only what changed is written; a blank HOSxP name keeps the saved one.
  expect(store.deliveryRequest.update.mock.calls).toEqual([
    [{ where: { id: 'r1' }, data: { patientName: 'นางสมร ศาลารักษ์', deliveryAddress: '154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล' } }],
    [{ where: { id: 'r3' }, data: { deliveryAddress: '1 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' } }],
  ]);
  expect(changed.get('r3')).toEqual({ patientName: 'บำเพ็ญ เชิญชม', deliveryAddress: '1 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' });
  expect(changed.has('r2')).toBe(false);

  await expect(refresh(open, store)).resolves.toEqual(new Map());
  expect(store.deliveryRequest.findMany).toHaveBeenCalledTimes(1);
});

test('two pages opening together share one sweep', async () => {
  const { hos, open } = hosWith(new Map());
  const store = storeWith();
  const refresh = createJobRefresher();
  await Promise.all([refresh(open, store), refresh(open, store)]);
  expect(hos.patientNames).toHaveBeenCalledTimes(1);
});

test('when HOSxP cannot be reached pages still load, and it is tried again a few minutes later', async () => {
  const open = vi.fn().mockRejectedValue(new Error('down'));
  const store = storeWith();
  const refresh = createJobRefresher();
  const start = Date.parse('2026-10-19T03:00:00Z');

  await expect(refresh(open, store, start)).resolves.toEqual(new Map());
  await refresh(open, store, start + 60_000);
  expect(open).toHaveBeenCalledTimes(1);
  await refresh(open, store, start + 6 * 60_000);
  expect(open).toHaveBeenCalledTimes(2);
  expect(store.deliveryRequest.update).not.toHaveBeenCalled();
});

test('zone names gain the village name, since most pages show the zone in place of the address', async () => {
  const { open } = hosWith(new Map());
  const store = storeWith();
  await createJobRefresher()(open, store);
  expect(store.deliveryZone.update.mock.calls).toEqual([[{ where: { id: 'z2' }, data: { displayName: 'หมู่ 2 บ้านจิ๋ว ต.ปลาโหล' } }]]);
});

test('when village names cannot be read, the sweep runs again a few minutes later', async () => {
  const { hos, open } = hosWith(new Map(), new Map());
  const store = storeWith();
  const refresh = createJobRefresher();
  const start = Date.parse('2026-10-19T03:00:00Z');

  await refresh(open, store, start);
  await refresh(open, store, start + 60_000);
  expect(hos.villageNames).toHaveBeenCalledTimes(1);
  await refresh(open, store, start + 6 * 60_000);
  expect(hos.villageNames).toHaveBeenCalledTimes(2);
});
