import { expect, test } from '@playwright/test';
import { login } from './login';

test('sends a visitor without a session to login and back after signing in', async ({ page }) => {
  await page.goto('/pharmacy/candidates');
  await expect(page).toHaveURL(/\/login\?next=%2Fpharmacy%2Fcandidates/);
  await login(page, 'pharmacy.uat');
  await expect(page).toHaveURL(/\/pharmacy\/candidates$/);
});

test('shows no pharmacy content to a rider and signs out', async ({ page }) => {
  await login(page, 'rider.internal.uat');
  await expect(page).toHaveURL(/\/rider\/scan$/);
  await page.goto('/pharmacy/candidates');
  await expect(page.getByRole('heading', { name: 'ไม่มีสิทธิ์เข้าหน้านี้' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ผู้ป่วยที่รอยืนยันการส่งยาถึงบ้าน' })).toHaveCount(0);

  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/rider/scan');
  await expect(page).toHaveURL(/\/login/);
});

test('rejects a wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('ชื่อผู้ใช้').fill('pharmacy.uat');
  await page.getByLabel('รหัสผ่าน').fill('wrong-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')).toBeVisible();
});
