import { expect, test } from '@playwright/test';
import { login } from './login';

test('pharmacy opens the manual from the menu with its own section first', async ({ page }) => {
  await login(page, 'pharmacy.uat');
  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'คู่มือการใช้งาน' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'คู่มือการใช้งาน' })).toBeVisible();
  const toc = page.getByRole('navigation', { name: 'สารบัญคู่มือ' }).getByRole('link');
  await expect(toc.nth(2)).toContainText('สำหรับเภสัชกรรม');
  await expect(page.getByRole('link', { name: 'ดาวน์โหลดคู่มือ PDF' })).toHaveAttribute('href', /health-rider-user-manual\.pdf$/);
});

test('a rider reaches the manual from their account page', async ({ page }) => {
  await login(page, 'rider.internal.uat');
  await page.goto('/rider/profile');
  await page.getByRole('link', { name: 'คู่มือการใช้งาน' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'สำหรับไรเดอร์' })).toBeVisible();
});
