import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PharmacyCandidateList } from '@/app/(staff)/pharmacy/candidates/pharmacy-candidate-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('loads HOSxP candidates and lets pharmacy confirm one', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{
      visitNumber: 'VN-TEST-001', hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
      telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '470907', villageCode: '01', zone: { id: 'zone-1', displayName: 'ปลาโหล หมู่ 1' },
    }]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'request-1' }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);

  render(<PharmacyCandidateList />);

  expect(await screen.findByText('ผู้ป่วยทดสอบ')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันสร้างงานส่งยา' }));

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(fetchMock.mock.calls[0]?.[0]).toMatch(/^\/api\/pharmacy\/candidates\?date=\d{4}-\d{2}-\d{2}$/);
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/pharmacy/candidates/confirm');
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toEqual({ visitNumber: 'VN-TEST-001', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  expect(await screen.findByText('สร้างงานส่งยาแล้ว')).toBeInTheDocument();
});

test('narrows a long day to the patients matching every search word', async () => {
  const candidate = (visit: string, hn: string, patientName: string, deliveryAddress: string) => ({
    visitNumber: visit, hn, patientName, patientAge: 60, telephone: null, deliveryAddress, subdistrictCode: '470907', villageCode: '01', zone: null,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([
    candidate('VN-1', 'HN-100', 'สมชาย ใจดี', '1 หมู่ 6 ต.ปลาโหล'),
    candidate('VN-2', 'HN-200', 'สมหญิง ใจงาม', '2 หมู่ 6 ต.ปลาโหล'),
    candidate('VN-3', 'HN-300', 'สมชาย มีสุข', '3 หมู่ 2 ต.ปลาโหล'),
  ]), { status: 200 })));

  render(<PharmacyCandidateList />);

  expect(await screen.findByText('ทั้งหมด 3 ราย')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'สมชาย หมู่ 6' } });
  expect(screen.getByText('พบ 1 จาก 3 ราย')).toBeInTheDocument();
  expect(screen.getByText('สมชาย ใจดี')).toBeInTheDocument();
  expect(screen.queryByText('สมชาย มีสุข')).not.toBeInTheDocument();

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'HN-200' } });
  expect(screen.getByText('สมหญิง ใจงาม')).toBeInTheDocument();
  expect(screen.getByText('พบ 1 จาก 3 ราย')).toBeInTheDocument();
});

test('filters by zone and confirms a whole zone in one request', async () => {
  const zone6 = { id: 'zone-6', displayName: 'ปลาโหล หมู่ 6' };
  const candidate = (visit: string, patientName: string, zone: typeof zone6 | null) => ({
    visitNumber: visit, hn: `HN-${visit}`, patientName, patientAge: 60, telephone: null, deliveryAddress: 'ปลาโหล',
    subdistrictCode: '470907', villageCode: zone ? '06' : '09', zone,
  });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([
      candidate('VN-1', 'ผู้ป่วยหนึ่ง', zone6), candidate('VN-2', 'ผู้ป่วยสอง', zone6), candidate('VN-3', 'ผู้ป่วยสาม', null),
    ]), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ confirmed: 2, visitNumbers: ['VN-1', 'VN-2'] }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('confirm', () => true);

  render(<PharmacyCandidateList />);

  expect(await screen.findByText('ยังไม่มีโซนสำหรับตำบล 470907 หมู่ 09')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('โซนจัดส่ง'), { target: { value: 'zone-6' } });
  expect(screen.queryByText('ผู้ป่วยสาม')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ยืนยันทั้งโซน ปลาโหล หมู่ 6 (2 ราย)' }));

  expect(await screen.findByText('สร้างงานส่งยาแล้ว 2 รายในโซน ปลาโหล หมู่ 6')).toBeInTheDocument();
  expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/pharmacy/candidates/confirm-zone');
  expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body)).toEqual({ zoneId: 'zone-6', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  expect(screen.queryByText('ผู้ป่วยหนึ่ง')).not.toBeInTheDocument();
  expect(screen.getByText('ผู้ป่วยสาม')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ยืนยันสร้างงานส่งยา' })).toBeDisabled();
});

test('picks a subdistrict first, then only offers that subdistrict\'s zones', async () => {
  const zoneA = { id: 'zone-a', displayName: 'หมู่ 1 ต.ปลาโหล' };
  const zoneB = { id: 'zone-b', displayName: 'หมู่ 2 ต.ค้อเขียว' };
  const candidate = (visit: string, subdistrictCode: string, subdistrictName: string, zone: typeof zoneA) => ({
    visitNumber: visit, hn: `HN-${visit}`, patientName: `ผู้ป่วย ${visit}`, patientAge: 60, telephone: null, deliveryAddress: subdistrictName,
    subdistrictCode, subdistrictName, villageCode: '01', zone,
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([
    candidate('VN-1', '470603', 'ต.ปลาโหล อ.วาริชภูมิ', zoneA),
    candidate('VN-2', '470602', 'ต.ค้อเขียว อ.วาริชภูมิ', zoneB),
  ]), { status: 200 })));

  render(<PharmacyCandidateList />);

  expect(await screen.findByText('ผู้ป่วย VN-2')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ตำบล'), { target: { value: '470603' } });
  expect(screen.queryByText('ผู้ป่วย VN-2')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'หมู่ 1 ต.ปลาโหล (1 ราย)' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'หมู่ 2 ต.ค้อเขียว (1 ราย)' })).not.toBeInTheDocument();
});
