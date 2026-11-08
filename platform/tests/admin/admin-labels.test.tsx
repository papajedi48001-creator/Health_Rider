import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { AdminLabels } from '@/app/(staff)/admin/admin-labels';
import { defaultLabelSettings } from '@/domain/settings/label-layout';

vi.mock('qrcode', () => ({ default: { toDataURL: async () => 'data:image/png;base64,' } }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('the sample label follows the text size the admin types, and shows the automatic size when empty', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: defaultLabelSettings, saved: false }), { status: 200 })));
  render(<AdminLabels />);

  const single = await screen.findByRole('group', { name: 'พิมพ์ฉลากเดียว' });
  const size = within(single).getByLabelText('ขนาดตัวอักษรทั่วไป (pt)');
  expect(size).toHaveAttribute('placeholder', 'อัตโนมัติ 11');
  expect(within(single).getByLabelText('ขนาดชื่อผู้ป่วย (pt)')).toHaveAttribute('placeholder', 'อัตโนมัติ 14.3');
  fireEvent.change(size, { target: { value: '14' } });
  expect(within(single).getByRole('article')).toHaveStyle({ fontSize: '14pt' });
  // The empty name size follows the new base size.
  expect(within(single).getByLabelText('ขนาดชื่อผู้ป่วย (pt)')).toHaveAttribute('placeholder', 'อัตโนมัติ 18.2');
  expect(within(screen.getByRole('group', { name: 'พิมพ์ฉลากรวม' })).getByRole('article')).toHaveStyle({ fontSize: '11pt' });
});

test('name, address and QR sizes typed by the admin show on the sample label', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ settings: defaultLabelSettings, saved: false }), { status: 200 })));
  render(<AdminLabels />);

  const single = await screen.findByRole('group', { name: 'พิมพ์ฉลากเดียว' });
  fireEvent.change(within(single).getByLabelText('ขนาดชื่อผู้ป่วย (pt)'), { target: { value: '20' } });
  fireEvent.change(within(single).getByLabelText('ขนาดที่อยู่ (pt)'), { target: { value: '9' } });
  fireEvent.change(within(single).getByLabelText('ขนาด QR (มม.)'), { target: { value: '35' } });
  const label = within(single).getByRole('article');
  expect(label.querySelector('.parcel-name')).toHaveStyle({ fontSize: '20pt' });
  expect(label.querySelector('.parcel-address')).toHaveStyle({ fontSize: '9pt' });
  expect(await within(label).findByRole('img')).toHaveStyle({ width: '35mm', height: '35mm' });
});
