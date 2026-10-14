import { expect, test } from '@playwright/test';
import { login } from './login';

test.use({ viewport: { width: 390, height: 844 } });

test('a rider opens their account from their name, edits their phone and sees the change log', async ({ page }) => {
  await login(page, 'rider.internal.uat');
  await page.getByRole('link', { name: /ข้อมูลผู้ใช้/ }).click();
  await expect(page).toHaveURL(/\/rider\/profile$/);
  await expect(page.getByRole('heading', { name: 'ข้อมูลผู้ใช้' })).toBeVisible();

  const phone = `08${String(Date.now()).slice(-8)}`;
  await page.getByRole('button', { name: 'แก้ไขข้อมูล' }).click();
  await page.getByLabel('เบอร์โทร').fill(phone);
  await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('บันทึกข้อมูลส่วนตัวแล้ว');
  await expect(page.getByLabel('ข้อมูลส่วนตัว')).toContainText(phone);
  const log = page.getByLabel('ประวัติการแก้ไขบัญชี');
  await expect(log.getByRole('listitem').first()).toContainText(`เบอร์โทร:`);
  await expect(log.getByRole('listitem').first()).toContainText(`→ ${phone}`);
});

test('the rider history filters fit a phone screen', async ({ page }) => {
  await login(page, 'rider.internal.uat');
  await page.goto('/rider/history');
  const filters = page.getByLabel('ตัวกรอง');
  await expect(filters.getByLabel('ถึงวันที่')).toBeVisible();
  const overflow = await filters.evaluate((card) => [...card.querySelectorAll('input, select, .summary-tile')]
    .some((element) => element.getBoundingClientRect().right > card.getBoundingClientRect().right + 0.5));
  expect(overflow).toBe(false);
});
