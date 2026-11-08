import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  vi.resetModules();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile');
});

afterEach(cleanup);

test('installs in one tap when Chrome offers its install prompt, then hides', async () => {
  const { InstallAppButton } = await import('@/pwa/install-app-button');
  render(<InstallAppButton />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  act(() => { window.dispatchEvent(event); });

  fireEvent.click(await screen.findByRole('button', { name: 'ติดตั้งแอป' }));

  await waitFor(() => expect(screen.queryByRole('region', { name: 'ติดตั้งแอป' })).toBeNull());
  expect(prompt).toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

test('shows the Add to Home Screen steps on iPhone, which has no install prompt', async () => {
  setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1');
  const { InstallAppButton } = await import('@/pwa/install-app-button');
  render(<InstallAppButton />);

  fireEvent.click(await screen.findByRole('button', { name: 'ติดตั้งแอป' }));

  expect(screen.getByRole('list')).toHaveTextContent('เพิ่มไปยังหน้าจอโฮม');
});

test('shows the Chrome menu steps on Android when the prompt is not offered', async () => {
  const { InstallAppButton } = await import('@/pwa/install-app-button');
  render(<InstallAppButton />);

  fireEvent.click(await screen.findByRole('button', { name: 'ติดตั้งแอป' }));

  expect(screen.getByRole('list')).toHaveTextContent('เพิ่มลงในหน้าจอหลัก');
});

test('is hidden inside the installed app', async () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  const { InstallAppButton } = await import('@/pwa/install-app-button');
  render(<InstallAppButton />);

  await act(async () => {});
  expect(screen.queryByRole('region', { name: 'ติดตั้งแอป' })).toBeNull();
});
