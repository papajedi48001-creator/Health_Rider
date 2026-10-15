import { expect, test } from '@playwright/test';
import { login } from './login';

test('a new pharmacist applies on the login page and signs in once an admin approves', async ({ page, browser }) => {
  const username = `apply.e2e.${Date.now().toString().slice(-6)}`;
  const password = 'e2e-applicant-password';

  await page.goto('/login');
  await page.getByRole('link', { name: 'สมัครเข้าใช้งาน' }).click();
  const form = page.getByRole('form', { name: 'สมัครเข้าใช้งาน' });
  await form.getByLabel('ชื่อ-นามสกุล').fill('ผู้สมัคร E2E');
  await form.getByLabel('เบอร์โทร').fill('0812345678');
  await form.getByLabel('หน้าที่ที่ต้องการใช้งาน').selectOption('pharmacy');
  await form.getByLabel('ชื่อผู้ใช้').fill(username);
  await form.getByLabel('รหัสผ่าน', { exact: true }).fill(password);
  await form.getByLabel('ยืนยันรหัสผ่าน').fill(password);
  await form.getByRole('button', { name: 'สมัครเข้าใช้งาน' }).click();
  await expect(page.getByText('สมัครเสร็จแล้ว รอผู้ดูแลระบบอนุมัติ')).toBeVisible();

  await page.goto('/login');
  await page.getByLabel('ชื่อผู้ใช้').fill(username);
  await page.getByLabel('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page.getByText('บัญชีนี้รอผู้ดูแลระบบอนุมัติ')).toBeVisible();

  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, 'admin.uat');
  await admin.goto('/admin');
  const application = admin.getByRole('form', { name: `คำขอของ ${username}` });
  await expect(application).toContainText('ขอใช้งานเป็น');
  await application.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(admin.getByText(`อนุมัติ ${username} แล้ว`)).toBeVisible();
  await adminContext.close();

  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/pharmacy\/candidates$/);
});
