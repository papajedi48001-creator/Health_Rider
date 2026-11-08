import { expect, test } from 'vitest';
import { withVillageName } from '@/domain/delivery/village-address';

test('puts the village name right after the village number', () => {
  expect(withVillageName('154 หมู่ 2 ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร', 'จิ๋ว')).toBe('154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร');
  expect(withVillageName('12 หมู่ที่ 9 ต.ปลาโหล', 'โคกศาลา')).toBe('12 หมู่ที่ 9 บ้านโคกศาลา ต.ปลาโหล');
  expect(withVillageName('5 ม.4 ต.วาริชภูมิ', 'ห้วยบาง ม.4')).toBe('5 ม.4 บ้านห้วยบาง ม.4 ต.วาริชภูมิ');
});

test('leaves an address alone when it already names the village or no name is known', () => {
  expect(withVillageName('154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล', 'จิ๋ว')).toBe('154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล');
  expect(withVillageName('154 หมู่ 2 ต.ปลาโหล', null)).toBe('154 หมู่ 2 ต.ปลาโหล');
  // A village named like its subdistrict still gets its name.
  expect(withVillageName('8 หมู่ 4 ต.ปลาโหล', 'ปลาโหล')).toBe('8 หมู่ 4 บ้านปลาโหล ต.ปลาโหล');
  expect(withVillageName('154 หมู่ 2 ต.ปลาโหล', '  ')).toBe('154 หมู่ 2 ต.ปลาโหล');
});

test('an address without a village number gets the name at the end', () => {
  expect(withVillageName('ตลาดสด ต.วาริชภูมิ', 'จิ๋ว')).toBe('ตลาดสด ต.วาริชภูมิ บ้านจิ๋ว');
  expect(withVillageName('', 'จิ๋ว')).toBe('');
});
