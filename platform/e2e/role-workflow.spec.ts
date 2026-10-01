import { expect, test } from '@playwright/test';
test('staff workflow pages describe operations, payouts and read-only audit', async ({ page }) => {
  await page.goto('/operations'); await expect(page.getByRole('heading', { name: 'ภาพรวมการจัดส่ง' })).toBeVisible();
  await page.goto('/finance/payouts'); await expect(page.getByText('ไม่มีการจ่ายเงินจริงในระบบ')).toBeVisible();
  await page.goto('/audit'); await expect(page.getByText('ไม่มีการแก้ไขหรือการลบข้อมูล')).toBeVisible();
});
