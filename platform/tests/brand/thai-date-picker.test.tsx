import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ThaiDatePicker, thaiShortDate } from '@/brand/thai-date-picker';

afterEach(cleanup);

test('formats dates the Thai way with Buddhist-era years', () => {
  expect(thaiShortDate('2026-11-13')).toBe('13 พ.ย. 2569');
  expect(thaiShortDate('2027-01-01')).toBe('1 ม.ค. 2570');
});

test('shows the value in Thai and hands back YYYY-MM-DD when a day is picked', () => {
  const onChange = vi.fn();
  render(<ThaiDatePicker label="ถึงวันที่" value="2026-11-13" onChange={onChange} />);
  const trigger = screen.getByRole('button', { name: 'ถึงวันที่ 13 พ.ย. 2569' });
  expect(screen.getByLabelText(/ถึงวันที่/)).toBe(trigger);

  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: 'เลือกถึงวันที่' })).toHaveTextContent('พฤศจิกายน 2569');
  fireEvent.click(screen.getByRole('button', { name: '20 พฤศจิกายน 2569' }));
  expect(onChange).toHaveBeenCalledWith('2026-11-20');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('keeps days outside min and max from being picked', () => {
  render(<ThaiDatePicker label="ตั้งแต่วันที่" value="2026-11-13" min="2026-11-10" max="2026-11-15" onChange={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /^ตั้งแต่วันที่/ }));
  expect(screen.getByRole('button', { name: '9 พฤศจิกายน 2569' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '16 พฤศจิกายน 2569' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '12 พฤศจิกายน 2569' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'เดือนก่อน' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'เดือนถัดไป' })).toBeDisabled();
});

test('submits the backend format with its form when named', () => {
  const { container } = render(<form><ThaiDatePicker label="วันเริ่มใช้" name="effectiveFrom" value="2026-11-13" onChange={vi.fn()} /></form>);
  const form = container.querySelector('form')!;
  expect(Object.fromEntries(new FormData(form))).toEqual({ effectiveFrom: '2026-11-13' });
});
