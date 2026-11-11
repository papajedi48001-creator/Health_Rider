import { expect, test } from 'vitest';
import { zoneHealthCenterName } from '@/hos/village-health-centers';

const fromHos = new Map([['470601/05', 'รพ.สต.ตาดโพนไผ่']]);

test('a zone prints the รพ.สต. HOSxP maps its village to', () => {
  expect(zoneHealthCenterName({ subdistrictCode: '470601', villageCode: '05', healthCenter: null }, fromHos)).toBe('รพ.สต.ตาดโพนไผ่');
});

test('a รพ.สต. chosen for the zone by an admin wins over HOSxP', () => {
  expect(zoneHealthCenterName({ subdistrictCode: '470601', villageCode: '05', healthCenter: { name: 'รพ.วาริชภูมิ' } }, fromHos)).toBe('รพ.วาริชภูมิ');
});

test('a village HOSxP does not map prints no รพ.สต.', () => {
  expect(zoneHealthCenterName({ subdistrictCode: '470601', villageCode: '06', healthCenter: null }, fromHos)).toBeNull();
});
