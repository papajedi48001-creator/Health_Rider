import { expect, test, vi } from 'vitest';

const { currentSession, loginRedirectPath, redirect } = vi.hoisted(() => ({
  currentSession: vi.fn(),
  loginRedirectPath: vi.fn(async () => '/login'),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
vi.mock('@/auth/current-session', () => ({ getSessionFromCookies: currentSession, loginRedirectPath }));
vi.mock('next/navigation', () => ({ redirect }));

test('sends a visitor without a session to login', async () => {
  const { default: HomePage } = await import('@/app/page');
  currentSession.mockResolvedValue(null);

  await expect(HomePage()).rejects.toThrow('redirect:/login');
});

test('tells a visitor whose session timed out why they are back at login', async () => {
  const { default: HomePage } = await import('@/app/page');
  currentSession.mockResolvedValue(null);
  loginRedirectPath.mockResolvedValueOnce('/login?reason=expired');

  await expect(HomePage()).rejects.toThrow('redirect:/login?reason=expired');
});

test('sends a signed-in rider to the QR scan page', async () => {
  const { default: HomePage } = await import('@/app/page');
  currentSession.mockResolvedValue({ id: 'rider-1', role: 'rider', displayName: 'ไรเดอร์' });

  await expect(HomePage()).rejects.toThrow('redirect:/rider/scan');
});
