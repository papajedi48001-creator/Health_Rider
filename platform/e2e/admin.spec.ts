import { expect, test } from '@playwright/test';
import { login } from './login';

test('admin adds a zone and a rider, and a deactivated rider can no longer sign in', async ({ page, browser }) => {
  const suffix = Date.now().toString().slice(-6);
  await login(page, 'admin.uat');
  await page.goto('/admin/zones');
  await expect(page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'โซนจัดส่ง' })).toHaveAttribute('aria-current', 'page');

  const zoneForm = page.getByRole('form', { name: 'เพิ่มโซน' });
  await zoneForm.getByLabel('รหัสตำบล').fill('980000');
  await zoneForm.getByLabel('รหัสหมู่บ้าน').fill(suffix.slice(-2));
  await zoneForm.getByLabel('ชื่อโซน').fill(`โซน E2E ${suffix}`);
  await zoneForm.getByRole('button', { name: 'เพิ่มโซน' }).click();
  await expect(page.getByRole('row').filter({ hasText: `โซน E2E ${suffix}` })).toBeVisible();

  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'บัญชีผู้ใช้' }).click();
  const username = `rider.e2e.${suffix}`;
  const userForm = page.getByRole('form', { name: 'สร้างบัญชี' });
  await userForm.getByLabel('ชื่อผู้ใช้').fill(username);
  await userForm.getByLabel('ชื่อที่แสดง').fill(`ไรเดอร์ E2E ${suffix}`);
  await userForm.getByLabel('บทบาท').selectOption('rider');
  // The system gives the next free code for the category; the admin cannot type over it.
  await expect(userForm.getByLabel('รหัสไรเดอร์')).toHaveValue(/^INT-\d{3,}$/);
  await userForm.getByLabel('ประเภทไรเดอร์').selectOption('external');
  await expect(userForm.getByLabel('รหัสไรเดอร์')).toHaveValue(/^EXT-\d{3,}$/);
  await userForm.getByLabel('ประเภทไรเดอร์').selectOption('internal');
  await expect(userForm.getByLabel('รหัสไรเดอร์')).not.toBeEditable();
  await userForm.getByLabel('รหัสผ่านเริ่มต้น').fill('e2e-rider-password');
  await userForm.getByRole('button', { name: 'สร้างบัญชี' }).click();
  const row = page.getByRole('row').filter({ hasText: `ไรเดอร์ E2E ${suffix}` });
  await expect(row).not.toContainText(username);
  await expect(row).toContainText(/INT-\d{3,} \(ภายใน\)/);

  const riderContext = await browser.newContext();
  const riderPage = await riderContext.newPage();
  await riderPage.goto('/login');
  await riderPage.getByLabel('ชื่อผู้ใช้').fill(username);
  await riderPage.getByLabel('รหัสผ่าน').fill('e2e-rider-password');
  await riderPage.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(riderPage).toHaveURL(/\/rider\/scan$/);

  await row.getByRole('button', { name: 'ปิดใช้งาน' }).click();
  // Deactivated accounts are hidden until the admin turns on the switch.
  await expect(row).toBeHidden();
  await page.getByText(/แสดงบัญชีที่ปิดใช้งาน/).click();
  await expect(page.getByRole('switch', { name: /แสดงบัญชีที่ปิดใช้งาน/ })).toBeChecked();
  await expect(row.getByRole('button', { name: 'เปิดใช้งาน' })).toBeVisible();
  await riderPage.reload();
  await expect(riderPage).toHaveURL(/\/login/);
});

test('admin corrects a whole-subdistrict price on the same day and the new price applies', async ({ page }) => {
  await login(page, 'admin.uat');
  await page.goto('/admin/zones');
  const suffix = Date.now().toString().slice(-6);
  const zoneForm = page.getByRole('form', { name: 'เพิ่มโซน' });
  await zoneForm.getByLabel('รหัสตำบล').fill('970000');
  await zoneForm.getByLabel('รหัสหมู่บ้าน').fill(suffix.slice(-2));
  await zoneForm.getByLabel('ชื่อโซน').fill(`โซนราคา ${suffix}`);
  await zoneForm.getByRole('button', { name: 'เพิ่มโซน' }).click();
  await expect(page.getByRole('row').filter({ hasText: `โซนราคา ${suffix}` })).toBeVisible();

  await page.getByRole('navigation', { name: 'เมนูหลัก' }).getByRole('link', { name: 'ค่าบริการ', exact: true }).click();
  const rateForm = page.getByRole('form', { name: 'เพิ่มค่าบริการ' });
  await rateForm.getByRole('combobox', { name: 'ตำบล', exact: true }).selectOption('970000');
  await rateForm.getByLabel('ค่าบริการ (บาท)').fill('30');
  await rateForm.getByRole('button', { name: 'บันทึกค่าบริการ' }).click();
  await expect(page.getByText('ราคาทั้งตำบลวันนี้: 30.00 บาท')).toBeVisible();

  await page.getByRole('button', { name: 'แก้ไขราคาทั้งตำบล' }).click();
  await rateForm.getByLabel('ค่าบริการ (บาท)').fill('20');
  await rateForm.getByRole('button', { name: 'บันทึกค่าบริการ' }).click();
  await expect(page.getByText('ราคาทั้งตำบลวันนี้: 20.00 บาท')).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: `โซนราคา ${suffix}` })).toContainText('20.00');
});
