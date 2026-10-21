import { expect, test, vi } from 'vitest';
import { createJobRefresher } from '@/domain/delivery/refresh-from-hos';

const zone2 = { subdistrictCode: '470602', villageCode: '02' };
const zone9 = { subdistrictCode: '470602', villageCode: '09' };
const rows = [
  { id: 'r1', hn: '450014298', patientName: 'สมร ศาลารักษ์', deliveryAddress: '154 หมู่ 2 ต.ปลาโหล', deliveryZone: zone2 },
  { id: 'r2', hn: '450003368', patientName: 'นายประเสริฐ จันทะฝ่าย', deliveryAddress: '9 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล', deliveryZone: zone9 },
  { id: 'r3', hn: '490039502', patientName: 'บำเพ็ญ เชิญชม', deliveryAddress: '1 หมู่ 9 ต.ปลาโหล', deliveryZone: zone9 },
];
type Patient = { name: string; address: string };
const hosWith = (names: Map<string, Patient>, villages = new Map([['470602/02', 'จิ๋ว'], ['470602/09', 'ดงเชียงเครือ']])) => {
  const hos = { patients: vi.fn().mockResolvedValue(names), villageNames: vi.fn().mockResolvedValue(villages) };
  return { hos, open: vi.fn().mockResolvedValue(hos) };
};
const zones = [
  { id: 'z2', ...zone2, displayName: 'หมู่ 2 ต.ปลาโหล' },
  { id: 'z9', ...zone9, displayName: 'หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' },
];
const storeWith = () => ({
  deliveryRequest: { findMany: vi.fn().mockResolvedValue(rows), update: vi.fn().mockResolvedValue({}) },
  deliveryZone: { findMany: vi.fn().mockResolvedValue(zones), update: vi.fn().mockResolvedValue({}) },
  auditEvent: { findMany: vi.fn().mockResolvedValue([] as Array<{ auditableId: string }>) },
});

test('every job picks up its name title and village name from HOSxP, once per server start', async () => {
  const { hos, open } = hosWith(new Map([
    ['450014298', { name: 'นางสมร ศาลารักษ์', address: '' }],
    ['450003368', { name: 'นายประเสริฐ จันทะฝ่าย', address: '' }],
    ['490039502', { name: '', address: '' }],
  ]));
  const store = storeWith();
  const refresh = createJobRefresher();

  const changed = await refresh(open, store);

  expect(hos.patients).toHaveBeenCalledWith(['450014298', '450003368', '490039502']);
  // Only what changed is written; a blank HOSxP name or address keeps the saved one.
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
  expect(hos.patients).toHaveBeenCalledTimes(1);
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

// Jobs confirmed before 2026-10-21 carry the contact person's address (informaddr); the sweep puts the patient's
// registered address in its place, except where staff corrected the address by hand.
test('jobs take the patient registered address from HOSxP, except an address staff amended', async () => {
  const { open } = hosWith(new Map([
    ['450014298', { name: 'สมร ศาลารักษ์', address: '402 หมู่ 18 บ้านดาดโพนไผ่ ต.วาริชภูมิ อ.วาริชภูมิ จ.สกลนคร' }],
    ['450003368', { name: 'นายประเสริฐ จันทะฝ่าย', address: '12 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' }],
    ['490039502', { name: 'บำเพ็ญ เชิญชม', address: '1 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' }],
  ]));
  const store = storeWith();
  store.auditEvent.findMany.mockResolvedValue([{ auditableId: 'r2' }]);

  const changed = await createJobRefresher()(open, store);

  expect(store.auditEvent.findMany).toHaveBeenCalledWith({ where: { action: 'delivery_request.amended_in_transit' }, select: { auditableId: true } });
  expect(store.deliveryRequest.update.mock.calls).toEqual([
    [{ where: { id: 'r1' }, data: { deliveryAddress: '402 หมู่ 18 บ้านดาดโพนไผ่ ต.วาริชภูมิ อ.วาริชภูมิ จ.สกลนคร' } }],
    [{ where: { id: 'r3' }, data: { deliveryAddress: '1 หมู่ 9 บ้านดงเชียงเครือ ต.ปลาโหล' } }],
  ]);
  expect(changed.has('r2')).toBe(false);
});
