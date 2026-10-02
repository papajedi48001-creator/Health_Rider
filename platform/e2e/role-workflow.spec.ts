import { expect, test } from '@playwright/test';
test('staff workflow pages expose delivery operations and no finance page', async ({ page }) => {
  await page.goto('/pharmacy/candidates'); await expect(page.getByRole('heading', { name: 'ผู้ป่วยที่รอยืนยันการส่งยาถึงบ้าน' })).toBeVisible();
  await page.goto('/operations'); await expect(page.getByRole('heading', { name: 'ภาพรวมการจัดส่ง' })).toBeVisible();
  await page.goto('/audit'); await expect(page.getByText('ไม่มีการแก้ไขหรือการลบข้อมูล')).toBeVisible();
  const financeResponse = await page.goto('/finance/payouts');
  expect(financeResponse?.status()).toBe(404);
  await expect(page.getByText(/finance|payout|ค่าตอบแทน|อัตราค่าบริการ/i)).toHaveCount(0);
});
