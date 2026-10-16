import { expect, test } from '@playwright/test';
import { samplePhoto } from './fixtures';
import { login } from './login';

test.use({ viewport: { width: 390, height: 844 } });

test('a rider opens their account from their name, edits their phone and sees the change log', async ({ page }) => {
  await login(page, 'rider.internal.uat');
  await page.getByRole('link', { name: /ข้อมูลผู้ใช้/ }).click();
  await expect(page).toHaveURL(/\/rider\/profile$/);
  await expect(page.getByRole('heading', { name: 'ข้อมูลผู้ใช้' })).toBeVisible();
  // The card stacks its heading, details and button; a row layout squeezes the name into one letter per line.
  const card = page.getByLabel('ข้อมูลส่วนตัว');
  const heading = await card.getByRole('heading', { name: 'ข้อมูลส่วนตัว' }).boundingBox();
  const details = await card.locator('dl').boundingBox();
  expect(details!.y).toBeGreaterThan(heading!.y + heading!.height - 1);

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

test('a staff member uploads a profile photo that shows beside their name, then removes it', async ({ page }) => {
  await login(page, 'coordinator.uat');
  await page.goto('/account');
  await page.getByLabel('เลือกรูปโปรไฟล์').setInputFiles(samplePhoto);
  await expect(page.getByRole('status')).toContainText('เปลี่ยนรูปโปรไฟล์แล้ว');

  const sidebarPhoto = page.locator('.staff-user img.avatar-photo');
  await expect(sidebarPhoto).toBeVisible();
  await expect.poll(() => sidebarPhoto.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(320);
  await expect(page.getByLabel('ประวัติการแก้ไขบัญชี').getByRole('listitem').first()).toContainText('เปลี่ยนรูปโปรไฟล์');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'ลบรูป' }).click();
  await expect(page.getByRole('status')).toContainText('ลบรูปโปรไฟล์แล้ว');
  await expect(page.locator('.staff-user img.avatar-photo')).toHaveCount(0);
});
