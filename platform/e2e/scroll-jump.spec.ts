import { expect, test } from '@playwright/test';
import { login } from './login';

test('long pages get to-top and to-bottom buttons that hide at each end', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'admin.uat');
  await page.goto('/help');
  const up = page.getByRole('button', { name: 'กลับบนสุด' });
  const down = page.getByRole('button', { name: 'ลงล่างสุด' });
  await expect(down).toBeVisible();
  await expect(up).toHaveCount(0);

  await down.click();
  await expect(down).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2)).toBe(true);

  await up.click();
  await expect(up).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test('on a rider phone the buttons sit above the developer credit and the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'rider.internal.uat');
  await page.goto('/rider/profile');
  const jump = await page.locator('.scroll-jump').boundingBox();
  const credit = await page.getByRole('button', { name: /พัฒนาโดย Jacky Hokk/ }).boundingBox();
  expect(jump!.y + jump!.height).toBeLessThanOrEqual(credit!.y);
});
