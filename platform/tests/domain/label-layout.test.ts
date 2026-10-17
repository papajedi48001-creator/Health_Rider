import { expect, test } from 'vitest';
import { defaultLabelSettings, labelFontPt, loadLabelSettings, pageLayout, parseLabelLayout, parseLabelSettings } from '@/domain/settings/label-layout';

const layout = { labelWidthMm: '90', labelHeightMm: '65', paper: 'A4', orientation: 'portrait', marginMm: '10' };

test('the standard layout keeps the two-column A4 sheet printed before labels were configurable', () => {
  expect(pageLayout(defaultLabelSettings.batch)).toMatchObject({ widthMm: 210, heightMm: 297, columns: 2, rows: 4, perPage: 8 });
});

test('counts how many labels fit across and down the printable area', () => {
  expect(pageLayout(parseLabelLayout({ ...layout, orientation: 'landscape' }, 'ฉลากรวม'))).toMatchObject({ widthMm: 297, heightMm: 210, columns: 3, rows: 2, perPage: 6 });
  expect(pageLayout(parseLabelLayout({ ...layout, labelWidthMm: '100', labelHeightMm: '70', paper: 'A6', orientation: 'landscape', marginMm: '2' }, 'x')))
    .toMatchObject({ widthMm: 148, heightMm: 105, perPage: 1 });
  expect(pageLayout(parseLabelLayout({ ...layout, paper: 'custom', paperWidthMm: '100', paperHeightMm: '300', marginMm: '0' }, 'x')))
    .toMatchObject({ widthMm: 100, heightMm: 300, columns: 1, rows: 4 });
});

test('a label-sized sheet prints one label per sheet with no margin', () => {
  const parsed = parseLabelLayout({ ...layout, labelWidthMm: '100', labelHeightMm: '75', paper: 'label', marginMm: '20' }, 'ฉลากเดียว');
  expect(parsed.marginMm).toBe(0);
  expect(pageLayout(parsed)).toMatchObject({ widthMm: 100, heightMm: 75, marginMm: 0, perPage: 1 });
});

test('rejects sizes outside the limits and labels that do not fit the paper, naming which print it is', () => {
  expect(() => parseLabelLayout({ ...layout, labelWidthMm: '5' }, 'ฉลากเดียว')).toThrow('ฉลากเดียว: ความกว้างฉลากต้องเป็นตัวเลข 20-300 มม.');
  expect(() => parseLabelLayout({ ...layout, labelHeightMm: 'abc' }, 'ฉลากรวม')).toThrow('ฉลากรวม: ความยาวฉลาก');
  expect(() => parseLabelLayout({ ...layout, paper: 'B5' }, 'ฉลากรวม')).toThrow('เลือกขนาดกระดาษ');
  expect(() => parseLabelLayout({ ...layout, labelWidthMm: '200', paper: 'A5' }, 'ฉลากรวม')).toThrow('ใหญ่กว่าพื้นที่พิมพ์ของกระดาษ A5 แนวตั้ง');
  expect(() => parseLabelSettings({ single: layout })).toThrow('ฉลากรวม');
});

test('text scales with the label so larger labels print larger', () => {
  expect(labelFontPt(defaultLabelSettings.single)).toBe(11);
  expect(labelFontPt(parseLabelLayout({ ...layout, labelWidthMm: '180', labelHeightMm: '130', paper: 'A4' }, 'x'))).toBe(22);
  expect(labelFontPt(parseLabelLayout({ ...layout, labelWidthMm: '45', labelHeightMm: '40' }, 'x'))).toBe(5.5);
});

test('loads saved settings, and falls back to the standard layout when none or a broken value is stored', async () => {
  const saved = parseLabelSettings({ single: { ...layout, paper: 'label' }, batch: layout });
  await expect(loadLabelSettings({ findUnique: async () => ({ value: saved }) })).resolves.toEqual({ settings: saved, saved: true });
  await expect(loadLabelSettings({ findUnique: async () => null })).resolves.toEqual({ settings: defaultLabelSettings, saved: false });
  await expect(loadLabelSettings({ findUnique: async () => ({ value: { single: 1 } }) })).resolves.toEqual({ settings: defaultLabelSettings, saved: false });
});
