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
  await rider.page.getByLabel('รหัสใต้ QR').fill(prepared.token);
  await rider.page.getByRole('button', { name: 'ยืนยันรหัส' }).click();
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
  await expect(pharmacy.page.getByLabel('ฉลาก QR พัสดุ')).toContainText(patientName);

  const rider = await signedIn(browser, 'rider.internal.uat');
  await rider.page.goto('/rider/scan');
  await rider.page.getByLabel('รหัสใต้ QR').fill(prepared.token);
  await rider.page.getByRole('button', { name: 'ยืนยันรหัส' }).click();
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

  await rider.page.getByRole('link', { name: 'ประวัติการส่ง' }).click();
  const delivered = rider.page.getByRole('listitem').filter({ hasText: patientName });
  await expect(delivered.getByText('ส่งสำเร็จ', { exact: true })).toHaveCSS('color', 'rgb(21, 128, 61)');
  await delivered.getByRole('button', { name: 'ดูรูปหลักฐาน' }).click();
  const photo = rider.page.getByRole('dialog').getByRole('img', { name: /รูปหลักฐานการส่ง/ });
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await rider.page.getByRole('button', { name: 'ปิดรูป' }).click();
  await expect(rider.page.getByRole('dialog')).toHaveCount(0);

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
  await rider.page.goto('/rider/history');
  const failed = rider.page.getByRole('listitem').filter({ hasText: patientName });
  await expect(failed.getByText(/^ส่งไม่สำเร็จ: ไม่พบผู้รับ/)).toHaveCSS('color', 'rgb(180, 35, 24)');

  await pharmacy.page.goto('/pharmacy/returns');
  await pharmacy.page.getByRole('listitem').filter({ hasText: patientName }).getByRole('button', { name: 'ยืนยันรับยาคืน' }).click();
  await expect(pharmacy.page.getByText('รับยาคืนแล้ว เตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')).toBeVisible();
  expect(await attemptStatus(attemptId)).toBe('returned');
  await pharmacy.page.goto('/pharmacy/packages');
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

test('opens a claimed job without signal and records pickup and delivery to send later', async ({ browser }) => {
  const patientName = `ผู้ป่วยออฟไลน์ ${Date.now()}`;
  const { attemptId, rider } = await prepareAndClaim(browser, patientName);
  // The job was opened by in-app navigation after the claim, never by a full page load.
  await expect.poll(() => rider.page.evaluate(async () => Boolean(await caches.match(location.pathname)))).toBe(true);

  await rider.context.setOffline(true);
  await rider.page.reload();
  await expect(rider.page.getByRole('heading', { name: patientName })).toBeVisible();
  await expect(rider.page.getByText('แสดงข้อมูลที่บันทึกไว้ในเครื่องตอนรับงาน')).toBeVisible();
  await rider.page.getByRole('button', { name: 'บันทึกรับยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('บันทึกไว้ในเครื่อง รอส่งเมื่อออนไลน์');
  await expect(rider.page.getByText('สถานะ: กำลังนำส่ง (รอส่งข้อมูล)')).toBeVisible();
  await expect(rider.page.getByRole('button', { name: 'บันทึกรับยา' })).toHaveCount(0);

  await rider.page.getByLabel(/รูปหลักฐาน/).setInputFiles(samplePhoto);
  await rider.page.getByRole('button', { name: 'บันทึกส่งยา' }).click();
  await expect(rider.page.getByRole('status')).toContainText('ค้างส่ง 2 รายการ');
  await expect(rider.page.getByText('สถานะ: บันทึกผลการส่งแล้ว รอส่งข้อมูล')).toBeVisible();

  await rider.context.setOffline(false);
  await expect(rider.page.getByRole('status')).toContainText('ส่งข้อมูลที่ค้างไว้แล้ว 2 รายการ');
  await expect(rider.page.getByText('สถานะ: ส่งสำเร็จ')).toBeVisible();
  expect(await attemptStatus(attemptId)).toBe('delivered');
});

test('prints QR labels for the ticked patients in one go', async ({ browser }) => {
  const names = [`ผู้ป่วยพิมพ์รวม ก ${Date.now()}`, `ผู้ป่วยพิมพ์รวม ข ${Date.now()}`];
  for (const name of names) await createDeliveryRequest(name);

  const pharmacy = await signedIn(browser, 'pharmacy.uat');
  await pharmacy.page.goto('/pharmacy/packages');
  for (const name of names) await pharmacy.page.getByLabel(`เลือกพิมพ์ ${name}`).check();
  await pharmacy.page.getByRole('button', { name: 'เตรียมพัสดุและพิมพ์ QR ที่เลือก (2)' }).click();

  const sheet = pharmacy.page.getByLabel('ฉลาก QR พัสดุ');
  await expect(sheet.getByRole('heading', { name: 'ฉลาก QR พัสดุ 2 ชิ้น' })).toBeVisible();
  await expect(sheet.getByRole('article')).toHaveCount(2);
  for (const name of names) await expect(sheet.getByRole('article').filter({ hasText: name }).getByRole('img', { name: /QR พัสดุ/ })).toBeVisible();
  await expect(sheet).toContainText('หากไม่มีผู้รับกรุณานำส่งคืน รพ.วาริชภูมิ');
  await expect(pharmacy.page.getByRole('listitem').filter({ hasText: names[0] })).toHaveCount(0);
  await pharmacy.context.close();
});

test('lets admin receive returned medication from the exceptions page, while coordinator only follows it', async ({ browser }) => {
  const patientName = `ผู้ป่วยรับคืนจากหน้าตรวจสอบ ${Date.now()}`;
  const { attemptId, pharmacy, rider } = await prepareAndClaim(browser, patientName);
  await rider.page.getByLabel('เหตุผล').selectOption('recipient_unavailable');
  await rider.page.getByRole('button', { name: 'บันทึกส่งไม่สำเร็จ' }).click();
  await expect(rider.page.getByText('นำยากลับมาคืนเภสัชกรรมภายในวันนี้')).toBeVisible();

  const coordinator = await signedIn(browser, 'coordinator.uat');
  await coordinator.page.goto('/operations/exceptions');
  const returns = coordinator.page.getByRole('region', { name: 'รอรับยาคืน' });
  await expect(returns.getByRole('row').filter({ hasText: patientName })).toBeVisible();
  await expect(returns).toContainText('เภสัชกรรมเป็นผู้กดยืนยันรับยาคืนที่เมนู “รอรับยาคืน”');
  await expect(returns.getByRole('button', { name: 'ยืนยันรับยาคืน' })).toHaveCount(0);

  const admin = await signedIn(browser, 'admin.uat');
  await admin.page.goto('/operations/exceptions');
  await admin.page.getByRole('row').filter({ hasText: patientName }).getByRole('button', { name: 'ยืนยันรับยาคืน' }).click();
  await expect(admin.page.getByText('รับยาคืนแล้ว เภสัชกรรมเตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')).toBeVisible();
  expect(await attemptStatus(attemptId)).toBe('returned');
  await Promise.all([pharmacy, rider, coordinator, admin].map((session) => session.context.close()));
});
