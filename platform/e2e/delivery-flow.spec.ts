import { expect, test, type Browser } from '@playwright/test';
import { attemptStatus, createDeliveryRequest, samplePhoto } from './fixtures';
import { login } from './login';

async function signedIn(browser: Browser, username: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, username);
  return { context, page };
}

async function prepareAndClaim(browser: Browser, patientName: string) {
  const request = await createDeliveryRequest(patientName);
  const pharmacy = await signedIn(browser, 'pharmacy.uat');
  const prepared = await (await pharmacy.page.request.post('/api/pharmacy/attempts/prepare', { data: { deliveryRequestId: request.id } })).json();
  const rider = await signedIn(browser, 'rider.internal.uat');
  await rider.page.goto('/rider/scan');
  await rider.page.getByLabel('QR token').fill(prepared.token);
  await rider.page.getByRole('button', { name: 'รับงาน' }).click();
  await expect(rider.page).toHaveURL(new RegExp(`/rider/attempts/${prepared.attemptId}$`));
  await expect(rider.page.getByRole('heading', { name: patientName })).toBeVisible();
  return { request, attemptId: prepared.attemptId as string, pharmacy, rider };
}

test('delivers a package from pharmacy preparation to proof of delivery', async ({ browser }) => {
  const patientName = `ผู้ป่วยส่งสำเร็จ ${Date.now()}`;
  await createDeliveryRequest(patientName);

  const pharmacy = await signedIn(browser, 'pharmacy.uat');
  await pharmacy.page.goto('/pharmacy/packages');
  const row = pharmacy.page.getByRole('listitem').filter({ hasText: patientName });
  const preparedResponse = pharmacy.page.waitForResponse('**/api/pharmacy/attempts/prepare');
  await row.getByRole('button', { name: 'เตรียมพัสดุและออก QR' }).click();
  const prepared = await (await preparedResponse).json();
  await expect(pharmacy.page.getByRole('img', { name: /QR พัสดุ/ })).toBeVisible();
  await expect(pharmacy.page.getByLabel('ฉลาก QR พัสดุ')).not.toContainText(patientName);

  const rider = await signedIn(browser, 'rider.internal.uat');
  await rider.page.goto('/rider/scan');
  await rider.page.getByLabel('QR token').fill(prepared.token);
  await rider.page.getByRole('button', { name: 'รับงาน' }).click();
  await expect(rider.page.getByRole('heading', { name: patientName })).toBeVisible();

  await rider.context.setOffline(true);
  await rider.page.getByRole('button', { name: 'บันทึกรับยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์');
  expect(await attemptStatus(prepared.attemptId)).toBe('claimed');
  await rider.context.setOffline(false);
  await expect(rider.page.getByRole('status')).toContainText('ส่งข้อมูลที่ค้างไว้แล้ว 1 รายการ');
  await expect(rider.page.getByText('สถานะ: กำลังนำส่ง')).toBeVisible();

  await rider.page.getByLabel(/รูปหลักฐาน/).setInputFiles(samplePhoto);
  await rider.page.getByLabel('ผู้รับยา').selectOption('spouse');
  await rider.page.getByRole('button', { name: 'บันทึกส่งยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('บันทึกและส่งข้อมูลแล้ว');
  await expect(rider.page.getByText('สถานะ: ส่งสำเร็จ')).toBeVisible();
  expect(await attemptStatus(prepared.attemptId)).toBe('delivered');

  const coordinator = await signedIn(browser, 'coordinator.uat');
  await coordinator.page.goto('/operations');
  await expect(coordinator.page.getByRole('row').filter({ hasText: patientName })).toContainText('ส่งสำเร็จ');
});

test('takes a failed delivery back to pharmacy and allows a new package', async ({ browser }) => {
  const patientName = `ผู้ป่วยส่งไม่สำเร็จ ${Date.now()}`;
  const { attemptId, pharmacy, rider } = await prepareAndClaim(browser, patientName);

  await rider.page.getByLabel('เหตุผล').selectOption('recipient_unavailable');
  await rider.page.getByRole('button', { name: 'บันทึกส่งไม่สำเร็จ' }).click();
  await expect(rider.page.getByText('นำยากลับมาคืนเภสัชกรรมภายในวันนี้')).toBeVisible();

  await pharmacy.page.goto('/pharmacy/packages');
  await pharmacy.page.getByRole('listitem').filter({ hasText: patientName }).getByRole('button', { name: 'ยืนยันรับยาคืน' }).click();
  await expect(pharmacy.page.getByText('รับยาคืนแล้ว เตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')).toBeVisible();
  expect(await attemptStatus(attemptId)).toBe('returned');
  const retry = pharmacy.page.getByRole('listitem').filter({ hasText: patientName });
  await expect(retry).toContainText('ส่งใหม่หลังรับยาคืนแล้ว');
  await expect(retry.getByRole('button', { name: 'เตรียมพัสดุและออก QR' })).toBeVisible();
});

test('sends a pickup recorded before an address change to coordinator review', async ({ browser }) => {
  const patientName = `ผู้ป่วยแก้ที่อยู่ ${Date.now()}`;
  const { request, attemptId, rider } = await prepareAndClaim(browser, patientName);

  const coordinator = await signedIn(browser, 'coordinator.uat');
  const amended = await coordinator.page.request.post(`/api/operations/requests/${request.id}/amend`, {
    data: { deliveryAddress: 'บ้านใหม่ E2E', reason: 'ผู้ป่วยแจ้งย้ายที่อยู่', expectedVersion: 1 },
  });
  expect(amended.status()).toBe(200);

  await rider.page.getByRole('button', { name: 'บันทึกรับยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('ต้องรอผู้ประสานงานตรวจสอบ');
  expect(await attemptStatus(attemptId)).toBe('sync_review');

  await coordinator.page.goto('/operations/exceptions');
  const conflict = coordinator.page.getByRole('listitem').filter({ hasText: patientName });
  await expect(conflict).toContainText('บันทึกก่อนข้อมูลจัดส่งถูกแก้ไข');
  await conflict.getByLabel('ยอมรับรายการนี้').check();
  await conflict.getByLabel('เหตุผล').fill('โทรยืนยันกับไรเดอร์แล้ว');
  await conflict.getByRole('button', { name: 'บันทึกผลการตรวจสอบ' }).click();
  await expect(coordinator.page.getByText('บันทึกผลการตรวจสอบแล้ว')).toBeVisible();
  expect(await attemptStatus(attemptId)).toBe('in_transit');
});

test('opens a claimed job and records pickup with no signal after the page was loaded once', async ({ browser }) => {
  const patientName = `ผู้ป่วยออฟไลน์ ${Date.now()}`;
  const { attemptId, rider } = await prepareAndClaim(browser, patientName);
  await rider.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await rider.page.reload();
  await expect(rider.page.getByRole('heading', { name: patientName })).toBeVisible();

  await rider.context.setOffline(true);
  await rider.page.reload();
  await expect(rider.page.getByRole('heading', { name: patientName })).toBeVisible();
  await expect(rider.page.getByText('แสดงข้อมูลที่บันทึกไว้ในเครื่องตอนรับงาน')).toBeVisible();
  await rider.page.getByRole('button', { name: 'บันทึกรับยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์');

  await rider.context.setOffline(false);
  await expect(rider.page.getByRole('status')).toContainText('ส่งข้อมูลที่ค้างไว้แล้ว 1 รายการ');
  expect(await attemptStatus(attemptId)).toBe('in_transit');
});
