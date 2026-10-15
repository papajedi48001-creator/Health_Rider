import { expect, test } from '@playwright/test';
import { idleSessions } from './fixtures';
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

test('ends a staff session when the browser closes or after 30 idle minutes', async ({ page, context }) => {
  await login(page, 'coordinator.uat');
  const staffCookie = (await context.cookies()).find((cookie) => cookie.name === 'health_rider_session');
  expect(staffCookie?.expires).toBe(-1);

  await idleSessions('coordinator.uat', 31);
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?reason=expired$/);
  await expect(page.getByText('หมดเวลาใช้งานหรือออกจากระบบแล้ว กรุณาเข้าสู่ระบบใหม่')).toBeVisible();
});

test('keeps a rider signed in on the phone for the shift', async ({ page, context }) => {
  await login(page, 'rider.internal.uat');
  const riderCookie = (await context.cookies()).find((cookie) => cookie.name === 'health_rider_session');
  expect(riderCookie?.expires).toBeGreaterThan(Date.now() / 1000 + 11 * 60 * 60);
  await idleSessions('rider.internal.uat', 120);
  await page.goto('/');
  await expect(page).toHaveURL(/\/rider\/scan$/);
});
