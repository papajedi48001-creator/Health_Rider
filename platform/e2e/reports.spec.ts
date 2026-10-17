import { expect, test } from '@playwright/test';
import { login } from './login';
import { createDeliveryRequest } from './fixtures';

test('each role sees only its own reports, and the admin downloads the fee CSV', async ({ page, browser }) => {
  await login(page, 'admin.uat');
  const menu = page.getByRole('navigation', { name: 'เมนูหลัก' });
  for (const label of ['รายงานเภสัชกรรม', 'รายงานการจัดส่ง', 'ค่าบริการไรเดอร์']) await expect(menu.getByRole('link', { name: label })).toBeVisible();

  await menu.getByRole('link', { name: 'รายงานการจัดส่ง' }).click();
  await expect(page.getByRole('heading', { name: 'รายงานการจัดส่ง' })).toBeVisible();
  await expect(page.getByText('อัตราส่งสำเร็จ')).toBeVisible();
  const riders = page.getByRole('region', { name: 'ผลงานไรเดอร์' });
  if (await riders.count()) {
    await riders.getByRole('button').first().click();
    const dialog = page.getByRole('dialog', { name: /^งานของ / });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('รหัสไรเดอร์')).toBeVisible();
    await dialog.getByRole('button', { name: 'ปิดรายการ' }).click();
    await expect(dialog).toHaveCount(0);
  }

  await menu.getByRole('link', { name: 'ค่าบริการไรเดอร์' }).click();
  await expect(page.getByText('ค่าบริการรวม')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'ดาวน์โหลด CSV' }).click();
  expect((await download).suggestedFilename()).toMatch(/^rider-fees-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);

  const pharmacyContext = await browser.newContext();
  const pharmacy = await pharmacyContext.newPage();
  await login(pharmacy, 'pharmacy.uat');
  const pharmacyMenu = pharmacy.getByRole('navigation', { name: 'เมนูหลัก' });
  await pharmacyMenu.getByRole('link', { name: 'รายงานเภสัชกรรม' }).click();
  await expect(pharmacy.getByRole('region', { name: 'งานค้างตอนนี้' })).toBeVisible();
  await pharmacy.getByRole('button', { name: '7 วันล่าสุด' }).click();
  await expect(pharmacy.getByRole('region', { name: 'สรุปช่วงวันที่ที่เลือก' })).toBeVisible();
  await expect(pharmacyMenu.getByRole('link', { name: 'ค่าบริการไรเดอร์' })).toHaveCount(0);
  await pharmacy.goto('/reports/fees');
  await expect(pharmacy.getByRole('heading', { name: 'ไม่มีสิทธิ์เข้าหน้านี้' })).toBeVisible();
  await pharmacyContext.close();
});

test('a coordinator narrows the operations overview by tapping a status tile', async ({ page }) => {
  await login(page, 'coordinator.uat');
  await page.goto('/operations');
  const tiles = page.getByRole('group', { name: 'กรองตามสถานะ' }).getByRole('button');
  await expect(tiles.first()).toBeVisible();
  const tileCount = await tiles.count();
  await tiles.first().click();
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'true');
  await expect(tiles).toHaveCount(tileCount);
  await expect(page.getByText(/^แสดงเฉพาะ/)).toBeVisible();
  await page.getByRole('button', { name: 'แสดงทุกสถานะ' }).click();
  await expect(tiles.first()).toHaveAttribute('aria-pressed', 'false');
});

test('a coordinator finds a delivery by HN and opens its details from the info button', async ({ page }) => {
  const patientName = `ผู้ป่วยค้นประวัติ ${Date.now()}`;
  const request = await createDeliveryRequest(patientName);
  await login(page, 'pharmacy.uat');
  await page.request.post('/api/pharmacy/attempts/prepare', { data: { deliveryRequestId: request.id } });
  await page.context().clearCookies();

  await login(page, 'coordinator.uat');
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ค้นหาประวัติการส่ง' }).click();
  const filters = page.getByRole('form', { name: 'ค้นหาประวัติการส่ง' });
  await filters.getByLabel('HN ผู้ป่วย').fill(request.hn);
  await filters.getByRole('button', { name: 'ค้นหา' }).click();
  await expect(page.getByText('พบ 1 งาน')).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: patientName });
  await row.getByRole('button', { name: `ดูรายละเอียดการส่ง ${patientName}` }).click();
  await expect(page.getByRole('dialog', { name: `รายละเอียดการส่ง ${patientName}` })).toContainText(request.hn);
});

test('the rider box suggests riders by part of their code or name', async ({ page }) => {
  await login(page, 'coordinator.uat');
  await page.goto('/reports/history');
  const riderBox = page.getByRole('form', { name: 'ค้นหาประวัติการส่ง' }).getByRole('combobox', { name: 'รหัสหรือชื่อไรเดอร์' });
  await riderBox.fill('ผู้รับจ้าง');
  await page.getByRole('option', { name: /UAT-EXT-01/ }).click();
  await expect(riderBox).toHaveValue('UAT-EXT-01');
  await expect(page.getByRole('listbox', { name: 'ไรเดอร์ที่ตรงกัน' })).toBeHidden();
});
