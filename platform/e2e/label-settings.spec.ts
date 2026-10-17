import { expect, test } from '@playwright/test';
import { login } from './login';

test('admin sets the label and paper size for single and batch printing', async ({ page }) => {
  await login(page, 'admin.uat');
  await page.goto('/admin/labels');
  const batch = page.getByRole('group', { name: 'พิมพ์ฉลากรวม' });
  await expect(batch.getByText('หน้าละ 8 ฉลาก')).toBeVisible();

  await batch.getByLabel('แนวกระดาษ').selectOption('landscape');
  await expect(batch.getByText('หน้าละ 6 ฉลาก')).toBeVisible();
  await batch.getByLabel('ความกว้างฉลาก (มม.)').fill('290');
  await expect(batch.getByText(/ใหญ่กว่าพื้นที่พิมพ์ของกระดาษ A4 แนวนอน/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'บันทึก' })).toBeDisabled();
  await batch.getByLabel('ความกว้างฉลาก (มม.)').fill('130');

  const single = page.getByRole('group', { name: 'พิมพ์ฉลากเดียว' });
  await single.getByLabel('ขนาดกระดาษ').selectOption('label');
  await expect(single.getByText('หน้าละ 1 ฉลาก')).toBeVisible();
  await expect(single.getByLabel('ขอบกระดาษ (มม.)')).toHaveCount(0);

  await page.getByRole('button', { name: 'บันทึก' }).click();
  await expect(page.getByText('บันทึกการตั้งค่าฉลากแล้ว')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('group', { name: 'พิมพ์ฉลากรวม' }).getByLabel('ความกว้างฉลาก (มม.)')).toHaveValue('130');
  await expect(page.getByRole('group', { name: 'พิมพ์ฉลากเดียว' }).getByLabel('ขนาดกระดาษ')).toHaveValue('label');

  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'กลับไปใช้ค่าเริ่มต้น' }).click();
  await expect(page.getByText('กลับไปใช้ค่าเริ่มต้นแล้ว')).toBeVisible();
  await expect(page.getByRole('group', { name: 'พิมพ์ฉลากรวม' }).getByText('หน้าละ 8 ฉลาก')).toBeVisible();
});
