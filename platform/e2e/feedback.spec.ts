import { expect, test, type Page } from '@playwright/test';
import { login } from './login';

// A click that lands before the page has hydrated does nothing, so try until the card opens.
async function openFeedback(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'ความคิดเห็น' }).click();
    await expect(page.getByRole('dialog', { name: 'ความคิดเห็น' })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test('pharmacy sends a problem from the corner button and reads the admin’s answer', async ({ browser }) => {
  const note = `ฉลากตัดชื่อผู้ป่วย ${Date.now()}`;
  const pharmacy = await browser.newPage();
  await login(pharmacy, 'pharmacy.uat');
  await pharmacy.goto('/dashboard');
  const card = pharmacy.getByRole('dialog', { name: 'ความคิดเห็น' });
  await openFeedback(pharmacy);
  await card.getByRole('radio', { name: 'แจ้งปัญหา' }).click();
  await card.getByLabel('รายละเอียด').fill(note);
  await card.getByRole('button', { name: 'ส่งความคิดเห็น' }).click();
  await expect(card).toContainText('ได้รับแล้ว ขอบคุณครับ');

  const admin = await browser.newPage();
  await login(admin, 'admin.uat');
  await admin.goto('/admin/feedback');
  await admin.getByRole('button', { name: new RegExp(note) }).click();
  const detail = admin.getByLabel('รายละเอียดความคิดเห็น');
  await expect(detail).toContainText('/dashboard');
  await detail.getByLabel('ตอบกลับผู้ส่ง').fill('รับทราบครับ กำลังแก้');
  await detail.getByRole('button', { name: 'ส่งคำตอบ' }).click();
  await expect(detail).toContainText('บันทึกแล้ว');
  await expect(detail.getByLabel('สถานะ')).toHaveValue('in_progress');

  await pharmacy.reload();
  await openFeedback(pharmacy);
  await pharmacy.getByRole('tab', { name: /ที่เคยส่ง/ }).click();
  const mine = pharmacy.getByRole('dialog', { name: 'ความคิดเห็น' }).getByRole('listitem').filter({ hasText: note });
  await expect(mine).toContainText('รับทราบครับ กำลังแก้');
  await expect(mine).toContainText('กำลังดำเนินการ');
});

test('a rider sends a note from the round button above the tab bar, starting from a common trouble', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'rider.internal.uat');
  await page.goto('/rider/scan');
  const button = await page.getByRole('button', { name: 'ความคิดเห็น' }).boundingBox();
  const tabbar = await page.locator('.rider-tabbar').boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(tabbar!.y);
  expect(button!.x).toBeGreaterThan(390 / 2);

  await openFeedback(page);
  const sheet = page.getByRole('dialog', { name: 'ความคิดเห็น' });
  await sheet.getByRole('button', { name: 'สแกน QR ไม่ติด' }).click();
  await expect(sheet.getByLabel('รายละเอียด')).toHaveValue('สแกน QR ไม่ติด');
  await sheet.getByRole('button', { name: 'ส่งความคิดเห็น' }).click();
  await expect(sheet).toContainText('ได้รับแล้ว ขอบคุณครับ');
  await sheet.getByRole('button', { name: 'ปิด' }).click();
  await expect(sheet).toBeHidden();
});
