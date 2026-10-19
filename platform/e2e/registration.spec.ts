import { expect, test } from '@playwright/test';
import { login } from './login';

test('a new pharmacist applies on the login page and signs in once an admin approves', async ({ page, browser }) => {
  const username = `apply.e2e.${Date.now().toString().slice(-6)}`;
  const password = 'e2e-applicant-password';
  const displayName = `ผู้สมัคร E2E ${username.slice(-6)}`;

  await page.goto('/login');
  await page.getByRole('link', { name: 'สมัครเข้าใช้งาน' }).click();
  const form = page.getByRole('form', { name: 'สมัครเข้าใช้งาน' });
  await form.getByLabel('ชื่อ-นามสกุล').fill(displayName);
  await form.getByLabel('เบอร์โทร').fill('0812345678');
  await form.getByLabel('หน้าที่ที่ต้องการใช้งาน').selectOption('pharmacy');
  await form.getByLabel('รพ.สต.').selectOption('รพ.สต.หนองท่ม');
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
  // Applications are listed one per line; the decision is made in a pop-up.
  const listed = admin.getByRole('listitem').filter({ hasText: displayName });
  await expect(listed).toContainText('ขอใช้งานเป็น');
  await expect(listed).not.toContainText(username);
  await listed.getByRole('button', { name: 'พิจารณา' }).click();
  const application = admin.getByRole('dialog', { name: `คำขอของ ${displayName}` });
  await expect(application).not.toContainText(username);
  await expect(application.getByLabel('รพ.สต.')).toHaveValue('รพ.สต.หนองท่ม');
  await application.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(admin.getByText(`อนุมัติ ${displayName} แล้ว`)).toBeVisible();
  await expect(application).toBeHidden();
  await adminContext.close();

  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/pharmacy\/candidates$/);
});
