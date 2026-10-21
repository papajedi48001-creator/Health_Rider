import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { createAccount } from './fixtures';
import { login } from './login';

test('an account with several roles picks one after login and can switch later', async ({ page }) => {
  await login(page, 'multi.uat');
  await expect(page).toHaveURL(/\/select-role$/);
  await expect(page.getByRole('heading', { name: 'เลือกบทบาท' })).toBeVisible();
  // Other pages wait until a role is picked.
  await page.goto('/operations');
  await expect(page).toHaveURL(/\/select-role$/);

  await page.getByRole('button', { name: /^ผู้ประสานงาน/ }).click();
  await expect(page).toHaveURL(/\/operations$/);
  const menu = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(menu.getByRole('link', { name: 'ภาพรวมการจัดส่ง' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'รอยืนยันจาก HOSxP' })).toHaveCount(0);

  await page.getByRole('link', { name: 'เปลี่ยนบทบาท' }).click();
  await page.getByRole('button', { name: /^เภสัชกร/ }).click();
  await expect(page).toHaveURL(/\/pharmacy\/candidates$/);
  await expect(menu.getByRole('link', { name: 'รอยืนยันจาก HOSxP' })).toBeVisible();
});

test('a user asks for another role on their profile and an admin approves it', async ({ page, browser }) => {
  const suffix = Date.now().toString().slice(-6);
  const username = `role.e2e.${suffix}`;
  const name = `ขอบทบาท E2E ${suffix}`;
  await createAccount(username, name, ['coordinator']);

  await login(page, username);
  await expect(page).toHaveURL(/\/operations$/);
  await page.goto('/account');
  const request = page.getByRole('form', { name: 'ขอเพิ่มบทบาท' });
  await request.getByLabel('บทบาทที่ต้องการ').selectOption('pharmacy');
  await request.getByLabel('เหตุผล (ถ้ามี)').fill('ช่วยงานห้องยา');
  await request.getByRole('button', { name: 'ส่งคำขอ' }).click();
  await expect(page.getByRole('list', { name: 'คำขอเพิ่มบทบาท' })).toContainText('เภสัชกรรม · รอผู้ดูแลระบบพิจารณา');

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, 'admin.uat');
  await adminPage.goto('/admin');
  const pending = adminPage.getByRole('region', { name: /คำขอเพิ่มบทบาทรออนุมัติ/ }).getByRole('listitem').filter({ hasText: name });
  await expect(pending).toContainText('ช่วยงานห้องยา');
  await pending.getByRole('button', { name: 'พิจารณา' }).click();
  await adminPage.getByRole('dialog', { name: `คำขอบทบาทของ ${name}` }).getByRole('button', { name: 'อนุมัติ', exact: true }).click();
  await expect(adminPage.getByText(`เพิ่มบทบาทเภสัชกรรมให้ ${name} แล้ว`)).toBeVisible();

  // The admin's list narrows by name, role and รพ.สต., and the download holds the same rows.
  const filters = adminPage.getByRole('search', { name: 'กรองบัญชีผู้ใช้' });
  await filters.getByLabel('ค้นหาชื่อ').fill(name);
  await filters.getByLabel('บทบาท').selectOption('pharmacy');
  await filters.getByLabel('สถานบริการ').selectOption('รพ.สต.ปลาโหล');
  const rows = adminPage.getByRole('row').filter({ hasText: name });
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('เภสัชกรรม');
  await expect(rows).toContainText('ผู้ประสานงาน');
  await filters.getByLabel('บทบาท').selectOption('rider');
  await expect(rows).toHaveCount(0);
  await filters.getByLabel('บทบาท').selectOption('');
  const [download] = await Promise.all([adminPage.waitForEvent('download'), filters.getByRole('link', { name: 'Export' }).click()]);
  const csv = readFileSync(await download.path(), 'utf8');
  expect(csv).toContain(username);
  expect(csv.trim().split('\r\n')).toHaveLength(2);
  await adminContext.close();

  // Signing in again now asks which of the two roles to work in.
  await page.getByRole('button', { name: 'ออกจากระบบ' }).click();
  await login(page, username);
  await expect(page).toHaveURL(/\/select-role$/);
  await expect(page.getByRole('button', { name: /^เภสัชกร/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^ผู้ประสานงาน/ })).toBeVisible();
});
