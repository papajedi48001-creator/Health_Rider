import { beforeEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { defaultLabelSettings } from '@/domain/settings/label-layout';

const { findSetting, upsertSetting, deleteSettings, createAudit, currentSession } = vi.hoisted(() => ({
  findSetting: vi.fn(), upsertSetting: vi.fn(), deleteSettings: vi.fn(), createAudit: vi.fn(), currentSession: vi.fn(),
}));
const tx = { systemSetting: { upsert: upsertSetting, deleteMany: deleteSettings }, auditEvent: { create: createAudit } };

vi.mock('@/auth/current-session', () => ({ getSessionFromRequest: currentSession }));
vi.mock('@/lib/db', () => ({
  db: { systemSetting: { findUnique: findSetting }, $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) },
}));

const admin = { id: 'admin-1', role: 'admin', displayName: 'ผู้ดูแล' };
const layout = { labelWidthMm: '100', labelHeightMm: '75', paper: 'label', orientation: 'portrait', marginMm: '0' };
const batch = { labelWidthMm: '90', labelHeightMm: '65', paper: 'A4', orientation: 'landscape', marginMm: '8' };
const route = () => import('@/app/api/label-settings/route');
const request = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/label-settings', { method, body: body === undefined ? undefined : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  findSetting.mockResolvedValue(null);
  deleteSettings.mockResolvedValue({ count: 1 });
});

test('pharmacy and admins read the layout to print with; the standard one until an admin saves', async () => {
  const { GET } = await route();
  for (const role of ['pharmacy', 'admin']) {
    currentSession.mockResolvedValue({ ...admin, role });
    await expect((await GET(request('GET'))).json()).resolves.toEqual({ settings: defaultLabelSettings, saved: false });
  }
  currentSession.mockResolvedValue({ ...admin, role: 'rider' });
  expect((await GET(request('GET'))).status).toBe(403);
});

test('only admins change the layout, and the change is audited', async () => {
  const { PUT } = await route();
  currentSession.mockResolvedValue({ ...admin, role: 'pharmacy' });
  expect((await PUT(request('PUT', { single: layout, batch }))).status).toBe(403);

  currentSession.mockResolvedValue(admin);
  const response = await PUT(request('PUT', { single: layout, batch }));

  expect(response.status).toBe(200);
  const value = upsertSetting.mock.calls[0]?.[0].create.value;
  expect(value.single).toMatchObject({ labelWidthMm: 100, labelHeightMm: 75, paper: 'label', marginMm: 0 });
  expect(value.batch).toMatchObject({ paper: 'A4', orientation: 'landscape', marginMm: 8 });
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'system_setting.updated', auditableId: 'qr_label', newValues: value });
});

test('a label larger than its paper is refused with the reason', async () => {
  const { PUT } = await route();
  currentSession.mockResolvedValue(admin);
  const response = await PUT(request('PUT', { single: layout, batch: { ...batch, labelWidthMm: '300', orientation: 'portrait' } }));
  expect(response.status).toBe(422);
  await expect(response.json()).resolves.toEqual({ message: expect.stringContaining('ฉลากรวม: ฉลาก 300 × 65 มม. ใหญ่กว่าพื้นที่พิมพ์') });
  expect(upsertSetting).not.toHaveBeenCalled();
});

test('resetting goes back to the standard layout', async () => {
  const { DELETE } = await route();
  currentSession.mockResolvedValue(admin);
  await expect((await DELETE(request('DELETE'))).json()).resolves.toEqual({ settings: defaultLabelSettings, saved: false });
  expect(createAudit.mock.calls[0]?.[0].data).toMatchObject({ action: 'system_setting.reset', auditableId: 'qr_label' });
});
