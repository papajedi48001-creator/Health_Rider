import { expect, type Page } from '@playwright/test';

// Accounts come from `npm run db:seed`; E2E_PASSWORD must match SEED_UAT_PASSWORD.
export async function login(page: Page, username: string) {
  const password = process.env.E2E_PASSWORD;
  if (!password) throw new Error('E2E_PASSWORD is required for browser tests');
  await page.goto('/login');
  await page.getByLabel('ชื่อผู้ใช้').fill(username);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}
