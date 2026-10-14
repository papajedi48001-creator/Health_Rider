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
