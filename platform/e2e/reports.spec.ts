import { expect, test } from '@playwright/test';
import { login } from './login';

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
