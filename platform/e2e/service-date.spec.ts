import { expect, test } from '@playwright/test';
import { login } from './login';

test('pharmacy picks the service date from a calendar that marks delivery days', async ({ page }) => {
  await login(page, 'pharmacy.uat');
  await page.goto('/pharmacy/candidates');
  const trigger = page.getByRole('button', { name: /^วันที่รับบริการ/ });
  await trigger.click();
  const calendar = page.getByRole('dialog', { name: 'เลือกวันที่รับบริการ' });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByText('รอยืนยัน (ตัวเลข = จำนวนราย)')).toBeVisible();

  await calendar.getByRole('button', { name: /^1 / }).click();
  await expect(calendar).toBeHidden();
  await expect(trigger).toHaveAccessibleName(/^วันที่รับบริการ 1 /);
});
