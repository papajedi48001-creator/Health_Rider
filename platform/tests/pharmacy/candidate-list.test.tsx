import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { PharmacyCandidateList } from '@/app/(staff)/pharmacy/candidates/pharmacy-candidate-list';

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
