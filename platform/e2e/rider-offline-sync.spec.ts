import { expect, test } from '@playwright/test';

test('retains an offline rider event and acknowledges it after reconnecting', async ({ page, context }) => {
  await page.goto('/rider/attempts/attempt-e2e');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'บันทึกรับยา' }).click();
  await expect(page.getByText('บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์')).toBeVisible();

  await context.setOffline(false);
  await page.route('**/api/rider/sync-events', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ acknowledged: true }) });
  });
  await page.getByRole('button', { name: 'บันทึกส่งยา' }).click();
  await expect(page.getByText('บันทึกและส่งข้อมูลแล้ว')).toBeVisible();
});
