import { expect, test } from '@playwright/test';
import { login } from './login';

test('admin adds a zone and a rider, and a deactivated rider can no longer sign in', async ({ page, browser }) => {
  const suffix = Date.now().toString().slice(-6);
  await login(page, 'admin.uat');
  await page.goto('/admin');

  const zoneForm = page.getByRole('form', { name: 'เพิ่มโซน' });
  await zoneForm.getByLabel('รหัสตำบล').fill('980000');
  await zoneForm.getByLabel('รหัสหมู่บ้าน').fill(suffix.slice(-2));
  await zoneForm.getByLabel('ชื่อโซน').fill(`โซน E2E ${suffix}`);
  await zoneForm.getByRole('button', { name: 'เพิ่มโซน' }).click();
  await expect(page.getByRole('row').filter({ hasText: `โซน E2E ${suffix}` })).toBeVisible();

  const username = `rider.e2e.${suffix}`;
  const userForm = page.getByRole('form', { name: 'สร้างบัญชี' });
  await userForm.getByLabel('ชื่อผู้ใช้').fill(username);
  await userForm.getByLabel('ชื่อที่แสดง').fill(`ไรเดอร์ E2E ${suffix}`);
  await userForm.getByLabel('บทบาท').selectOption('rider');
  await userForm.getByLabel('รหัสไรเดอร์').fill(`E2E-${suffix}`);
  await userForm.getByLabel('รหัสผ่านเริ่มต้น').fill('e2e-rider-password');
  await userForm.getByRole('button', { name: 'สร้างบัญชี' }).click();
  const row = page.getByRole('row').filter({ hasText: username });
  await expect(row).toContainText(`E2E-${suffix} (ภายใน)`);

  const riderContext = await browser.newContext();
  const riderPage = await riderContext.newPage();
  await riderPage.goto('/login');
  await riderPage.getByLabel('ชื่อผู้ใช้').fill(username);
  await riderPage.getByLabel('รหัสผ่าน').fill('e2e-rider-password');
  await riderPage.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(riderPage).toHaveURL(/\/rider\/scan$/);

  await row.getByRole('button', { name: 'ปิดใช้งาน' }).click();
  await expect(row.getByRole('button', { name: 'เปิดใช้งาน' })).toBeVisible();
  await riderPage.reload();
  await expect(riderPage).toHaveURL(/\/login/);
});
