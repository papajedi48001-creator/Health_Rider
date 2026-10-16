import { expect, test } from '@playwright/test';
import { login } from './login';

test('the developer credit opens a balloon with contact details, above the rider tab bar on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'rider.internal.uat');
  const credit = page.getByRole('button', { name: /พัฒนาโดย Jacky Hokk/ });
  const tabbar = await page.locator('.rider-tabbar').boundingBox();
  const button = await credit.boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(tabbar!.y);
  expect(button!.x + button!.width).toBeGreaterThan(390 - 40);

  await credit.click();
  const balloon = page.getByRole('dialog', { name: 'ติดต่อผู้พัฒนา' });
  await expect(balloon.getByRole('link', { name: '085-228-7387' })).toHaveAttribute('href', 'tel:0852287387');
  await expect(balloon.getByRole('link', { name: 'jacky.hokk' })).toHaveAttribute('href', 'https://www.facebook.com/jacky.hokk');
  await page.keyboard.press('Escape');
  await expect(balloon).toHaveCount(0);
});
