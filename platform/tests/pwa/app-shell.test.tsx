import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('@/lib/app-version', () => ({ appVersion: 'build-1' }));

const reload = vi.fn();
const fetchMock = vi.fn();

function setUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  sessionStorage.clear();
  reload.mockReset();
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ version: 'build-1' }) });
  vi.stubGlobal('fetch', fetchMock);
  Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true });
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130.0 Mobile');
});

afterEach(() => vi.unstubAllGlobals());

test('invites Android browsers to install the app and uses the install prompt when Chrome offers it', async () => {
  const { AppShell } = await import('@/pwa/app-shell');
  render(<AppShell />);
  expect(await screen.findByRole('region', { name: 'ติดตั้งแอป' })).toHaveTextContent('เพิ่มลงในหน้าจอหลัก');

  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
  act(() => { window.dispatchEvent(event); });
  fireEvent.click(await screen.findByRole('button', { name: 'ติดตั้ง' }));

  await waitFor(() => expect(screen.queryByRole('region', { name: 'ติดตั้งแอป' })).toBeNull());
  expect(prompt).toHaveBeenCalled();
  expect(event.defaultPrevented).toBe(true);
});

test('does not invite inside the installed app or on other platforms', async () => {
  const { AppShell } = await import('@/pwa/app-shell');
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
  const { unmount } = render(<AppShell />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  expect(screen.queryByRole('region', { name: 'ติดตั้งแอป' })).toBeNull();
  unmount();

  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as unknown as typeof window.matchMedia;
  setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0');
  render(<AppShell />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('region', { name: 'ติดตั้งแอป' })).toBeNull();
});

test('reloads into a newer deployed version when the page opens, once per version', async () => {
  const { AppShell } = await import('@/pwa/app-shell');
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ version: 'build-2' }) });

  const { unmount } = render(<AppShell />);
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/version'), { cache: 'no-store' });
  unmount();

  // Still old after the reload (a cache served the old page): ask instead of reloading again.
  render(<AppShell />);
  expect(await screen.findByRole('status')).toHaveTextContent('เวอร์ชันใหม่');
  expect(reload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'อัปเดตเลย' }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(2));
});
