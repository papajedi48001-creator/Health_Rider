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
  const size = within(single).getByLabelText('ขนาดตัวอักษร (pt)');
  expect(size).toHaveAttribute('placeholder', 'อัตโนมัติ (11)');
  fireEvent.change(size, { target: { value: '14' } });
  expect(within(single).getByRole('article')).toHaveStyle({ fontSize: '14pt' });
  expect(within(screen.getByRole('group', { name: 'พิมพ์ฉลากรวม' })).getByRole('article')).toHaveStyle({ fontSize: '11pt' });
});
