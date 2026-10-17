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

  fireEvent.change(search, { target: { value: 'ไม่มีคนนี้' } });
  expect(screen.getByText('ไม่พบคนไข้ที่ตรงกับคำค้นหา')).toBeInTheDocument();
});

test('the search box only appears on the packages-to-prepare queue', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ toPrepare: [], awaitingRider: [], returnRequired: [] }), { status: 200 })));
  render(<PharmacyPackageBoard view="awaiting" />);
  expect(await screen.findByText('รอไรเดอร์รับงาน (0)')).toBeInTheDocument();
  expect(screen.queryByLabelText('ค้นหา HN / ชื่อคนไข้')).not.toBeInTheDocument();
});
