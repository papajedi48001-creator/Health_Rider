import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const zone = (id: string, displayName: string, subdistrictCode: string, subdistrictName: string | null) => ({ id, displayName, subdistrictCode, subdistrictName });
const row = (id: string, patientName: string, rowZone: ReturnType<typeof zone>) => ({
  id, hn: `HN-${id}`, patientName, deliveryAddress: '-', zone: rowZone, latestAttempt: null,
});

test('narrows the package board by subdistrict, then by zone within it', async () => {
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  const plaLo7 = zone('z-7', 'ปลาโหล ม.7', '470603', 'ต.ปลาโหล');
  const other = zone('z-1', 'ค้อเขียว ม.1', '470602', null);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    toPrepare: [row('r1', 'ผู้ป่วยหนึ่ง', plaLo6), row('r2', 'ผู้ป่วยสอง', plaLo7), row('r3', 'ผู้ป่วยสาม', other)],
    awaitingRider: [], returnRequired: [],
  }), { status: 200 })));

  render(<PharmacyPackageBoard view="prepare" />);

  expect(await screen.findByText('ต้องเตรียมพัสดุ (3)')).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'ตำบล 470602' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ตำบล'), { target: { value: '470603' } });
  expect(screen.getByText('ต้องเตรียมพัสดุ (2)')).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'ค้อเขียว ม.1' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('โซนจัดส่ง'), { target: { value: 'z-7' } });
  expect(screen.getByText('ต้องเตรียมพัสดุ (1)')).toBeInTheDocument();
  expect(screen.getByText('ผู้ป่วยสอง')).toBeInTheDocument();
  expect(screen.queryByText('ผู้ป่วยหนึ่ง')).not.toBeInTheDocument();
});

test('finds a patient to prepare by HN or name, and select-all ticks only the matches', async () => {
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    toPrepare: [row('450014298', 'ศักดา สัดถาผล', plaLo6), row('450003368', 'ประเสริฐ จันทะฝ่าย', plaLo6), row('490039502', 'บำเพ็ญ เชิญชม', plaLo6)],
    awaitingRider: [], returnRequired: [],
  }), { status: 200 })));

  render(<PharmacyPackageBoard view="prepare" />);

  expect(await screen.findByText('ต้องเตรียมพัสดุ (3)')).toBeInTheDocument();
  const search = screen.getByLabelText('ค้นหา HN / ชื่อคนไข้');
  fireEvent.change(search, { target: { value: '0003368' } });
  expect(screen.getByText('ต้องเตรียมพัสดุ (1)')).toBeInTheDocument();
  expect(screen.getByText('ประเสริฐ จันทะฝ่าย')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'เชิญ' } });
  expect(screen.getByText('บำเพ็ญ เชิญชม')).toBeInTheDocument();
  expect(screen.queryByText('ศักดา สัดถาผล')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/เลือกทั้งหมด/));
  expect(screen.getByRole('button', { name: 'เตรียมพัสดุและพิมพ์ QR ที่เลือก (1)' })).toBeInTheDocument();

  // Typing offers the patients in the current filters as suggestions; picking one narrows to that patient.
  expect(search).toHaveAttribute('list', 'package-patients');
  const suggestions = [...document.querySelectorAll('#package-patients option')].map((option) => option.getAttribute('value'));
  expect(suggestions).toEqual(['ศักดา สัดถาผล HN-450014298', 'ประเสริฐ จันทะฝ่าย HN-450003368', 'บำเพ็ญ เชิญชม HN-490039502']);
  fireEvent.change(search, { target: { value: 'ประเสริฐ จันทะฝ่าย HN-450003368' } });
  expect(screen.getByText('ต้องเตรียมพัสดุ (1)')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: 'ไม่มีคนนี้' } });
  expect(screen.getByText('ไม่พบคนไข้ที่ตรงกับคำค้นหา')).toBeInTheDocument();
});

test('the waiting-for-rider and take-back queues can be searched by HN or name too', async () => {
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  const prepared = (id: string, patientName: string) => ({ ...row(id, patientName, plaLo6), latestAttempt: { id: `a-${id}`, status: 'prepared', failureReason: null, failedAt: null } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
    toPrepare: [], awaitingRider: [prepared('450014298', 'นางสมร ศาลารักษ์'), prepared('450003368', 'นายสรรเพชร ศิรินา')], returnRequired: [],
  }), { status: 200 })));
  render(<PharmacyPackageBoard view="awaiting" />);

  expect(await screen.findByText('รอไรเดอร์รับงาน (2)')).toBeInTheDocument();
  const search = screen.getByLabelText('ค้นหา HN / ชื่อคนไข้');
  expect([...document.querySelectorAll('#package-patients option')].map((option) => option.getAttribute('value')))
    .toEqual(['นางสมร ศาลารักษ์ HN-450014298', 'นายสรรเพชร ศิรินา HN-450003368']);
  fireEvent.change(search, { target: { value: 'สรรเพชร' } });
  expect(screen.getByText('รอไรเดอร์รับงาน (1)')).toBeInTheDocument();
  expect(screen.queryByText('นางสมร ศาลารักษ์')).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'ไม่มีคนนี้' } });
  expect(screen.getByText('ไม่พบคนไข้ที่ตรงกับคำค้นหา')).toBeInTheDocument();
});

test('edits a waiting package only after confirming the old and new values', async () => {
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  const board = { toPrepare: [], returnRequired: [], awaitingRider: [{
    ...row('r1', 'นางสมร ศาลารักษ์', plaLo6), deliveryAddress: 'บ้านเดิม', telephone: '0800000000', deliveryVersion: 1, deletable: true,
    latestAttempt: { id: 'a-r1', status: 'prepared', failureReason: null, failedAt: null },
  }] };
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(board), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PharmacyPackageBoard view="awaiting" />);

  fireEvent.click(await screen.findByRole('button', { name: 'แก้ไข นางสมร ศาลารักษ์' }));
  fireEvent.change(screen.getByLabelText('ที่อยู่จัดส่ง'), { target: { value: 'บ้านใหม่' } });
  fireEvent.change(screen.getByLabelText('เหตุผลการแก้ไข'), { target: { value: 'ญาติแจ้งย้ายบ้าน' } });
  fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));

  expect(screen.getByText('ยืนยันการแก้ไข')).toBeInTheDocument();
  expect(screen.getByText('บ้านเดิม')).toBeInTheDocument();
  expect(screen.getByText('บ้านใหม่')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันแก้ไข' }));
  expect(await screen.findByText(/แก้ไขข้อมูล นางสมร ศาลารักษ์ แล้ว/)).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[1];
  expect(String(url)).toContain('/api/pharmacy/requests/r1');
  expect(init.method).toBe('PATCH');
  expect(JSON.parse(init.body)).toEqual({ deliveryAddress: 'บ้านใหม่', telephone: '0800000000', reason: 'ญาติแจ้งย้ายบ้าน', expectedVersion: 1 });
});

test('deleting asks for a reason and confirmation; jobs with delivery history offer no delete', async () => {
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  const board = { awaitingRider: [], returnRequired: [], toPrepare: [
    { ...row('r1', 'ผู้ป่วยใหม่', plaLo6), deletable: true },
    { ...row('r2', 'ผู้ป่วยส่งซ้ำ', plaLo6), deletable: false, latestAttempt: { id: 'a-r2', status: 'returned', failureReason: null, failedAt: null } },
  ] };
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(board), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  render(<PharmacyPackageBoard view="prepare" />);

  expect(await screen.findByRole('button', { name: 'ลบ ผู้ป่วยใหม่' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ลบ ผู้ป่วยส่งซ้ำ' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'แก้ไข ผู้ป่วยส่งซ้ำ' })).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'ลบ ผู้ป่วยใหม่' }));
  expect(screen.getByRole('dialog', { name: 'ลบงานของ ผู้ป่วยใหม่' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('เหตุผลการลบ'), { target: { value: 'ผู้ป่วยมารับยาเอง' } });
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันลบ' }));
  expect(await screen.findByText(/ลบงานของ ผู้ป่วยใหม่ แล้ว/)).toBeInTheDocument();
  const [url, init] = fetchMock.mock.calls[1];
  expect(String(url)).toContain('/api/pharmacy/requests/r1');
  expect(init.method).toBe('DELETE');
  expect(JSON.parse(init.body)).toEqual({ reason: 'ผู้ป่วยมารับยาเอง' });
});

test('reprints a waiting label with the QR this browser issued, without issuing a new one', async () => {
  window.localStorage.clear();
  const plaLo6 = zone('z-6', 'ปลาโหล ม.6', '470603', 'ต.ปลาโหล');
  const board = { toPrepare: [], returnRequired: [], awaitingRider: [
    { ...row('r1', 'นางสมร ศาลารักษ์', plaLo6), latestAttempt: { id: 'a-r1', status: 'prepared', failureReason: null, failedAt: null } },
    { ...row('r2', 'นายสรรเพชร ศิรินา', plaLo6), latestAttempt: { id: 'a-r2', status: 'prepared', failureReason: null, failedAt: null } },
  ] };
  const fetchMock = vi.fn().mockImplementation(async (url: string) => {
    if (url.endsWith('/qr')) return new Response(JSON.stringify({ attemptId: 'a-r1', token: 'first-token-0123456789abcdef' }), { status: 201 });
    if (url.endsWith('/qr/reprint')) return new Response(JSON.stringify({ attemptId: 'a-r1' }), { status: 200 });
    if (url.includes('label-settings')) return new Response('{}', { status: 500 });
    return new Response(JSON.stringify(board), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('print', vi.fn());
  render(<PharmacyPackageBoard view="awaiting" />);

  // Issue a QR first so this browser keeps its token, then close the sheet.
  fireEvent.click((await screen.findAllByRole('button', { name: 'ออก QR ใหม่' }))[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'ปิด' }));

  fireEvent.click(screen.getByRole('button', { name: 'พิมพ์ซ้ำ นางสมร ศาลารักษ์' }));
  expect(await screen.findByRole('heading', { name: 'พิมพ์ฉลากซ้ำ 1 ชิ้น' })).toBeInTheDocument();
  const reprintCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/qr/reprint'))!;
  expect(String(reprintCall[0])).toContain('/api/pharmacy/attempts/a-r1/qr/reprint');
  expect(JSON.parse(reprintCall[1].body)).toEqual({ token: 'first-token-0123456789abcdef' });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/qr'))).toHaveLength(1);
  expect(screen.getByText('รหัสใต้ QR:').parentElement).toHaveTextContent('first-token-0123456789abcdef');

  // The label turns over only for the 180° print and is upright again afterwards.
  let turnedWhilePrinting = false;
  vi.mocked(window.print).mockImplementation(() => { turnedWhilePrinting = document.querySelector('.label-dialog')!.classList.contains('label-rotated'); });
  fireEvent.click(screen.getByRole('button', { name: 'พิมพ์กลับด้าน 180°' }));
  await vi.waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));
  expect(turnedWhilePrinting).toBe(true);
  await vi.waitFor(() => expect(document.querySelector('.label-rotated')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'ปิด' }));

  // A package whose QR was issued on another computer cannot be reprinted here.
  fireEvent.click(screen.getByRole('button', { name: 'พิมพ์ซ้ำ นายสรรเพชร ศิรินา' }));
  expect(await screen.findByText(/พิมพ์ซ้ำไม่ได้ 1 ราย \(นายสรรเพชร ศิรินา\)/)).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'ฉลาก QR พัสดุ' })).not.toBeInTheDocument();
});
