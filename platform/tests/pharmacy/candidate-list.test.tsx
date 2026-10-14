import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PharmacyCandidateList } from '@/app/(staff)/pharmacy/candidates/pharmacy-candidate-list';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test('loads HOS candidates and lets pharmacy confirm one', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify([{
      visitNumber: 'VN-TEST-001', hn: 'HN-TEST-001', patientName: 'ผู้ป่วยทดสอบ', patientAge: 64,
      telephone: '0800000000', deliveryAddress: 'บ้านทดสอบ', subdistrictCode: '46', villageCode: '01',
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
    visitNumber: visit, hn, patientName, patientAge: 60, telephone: null, deliveryAddress, subdistrictCode: '46', villageCode: '01',
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
