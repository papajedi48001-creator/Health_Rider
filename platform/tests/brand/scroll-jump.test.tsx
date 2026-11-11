import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ScrollJump } from '@/brand/scroll-jump';

function page(height: number, y: number) {
  Object.defineProperty(document.documentElement, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
}

async function settle() {
  await act(async () => { fireEvent.scroll(window); await new Promise((r) => setTimeout(r, 20)); });
}

afterEach(cleanup);

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
});

test('shows nothing on a page too short to scroll', async () => {
  page(820, 0);
  render(<ScrollJump />);
  await settle();
  expect(screen.queryByRole('button')).toBeNull();
});

test('shows only the down button at the top and only the up button at the bottom', async () => {
  page(3000, 0);
  render(<ScrollJump />);
  await settle();
  expect(screen.queryByRole('button', { name: 'กลับบนสุด' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'ลงล่างสุด' }));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 3000, behavior: 'smooth' });

  page(3000, 2200);
  await settle();
  expect(screen.queryByRole('button', { name: 'ลงล่างสุด' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'กลับบนสุด' }));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
});

test('shows both buttons in the middle and jumps without animation when motion is reduced', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  page(3000, 1000);
  render(<ScrollJump />);
  await settle();
  fireEvent.click(screen.getByRole('button', { name: 'กลับบนสุด' }));
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
  expect(screen.getByRole('button', { name: 'ลงล่างสุด' })).toBeInTheDocument();
});
