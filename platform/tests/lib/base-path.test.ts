import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(basePath: string | undefined) {
  vi.resetModules();
  if (basePath === undefined) vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined as unknown as string);
  else vi.stubEnv('NEXT_PUBLIC_BASE_PATH', basePath);
  return import('@/lib/base-path');
}

afterEach(() => vi.unstubAllEnvs());

describe('base path helpers', () => {
  it('leaves paths alone when the app is served at the root', async () => {
    const { withBasePath, withoutBasePath } = await load(undefined);
    expect(withBasePath('/api/auth/login')).toBe('/api/auth/login');
    expect(withoutBasePath('/rider/scan')).toBe('/rider/scan');
  });

  it('adds and removes the base path for app routes', async () => {
    const { withBasePath, withoutBasePath } = await load('/health-rider');
    expect(withBasePath('/api/auth/login')).toBe('/health-rider/api/auth/login');
    expect(withBasePath('/login?next=%2Frider%2Fscan')).toBe('/health-rider/login?next=%2Frider%2Fscan');
    expect(withoutBasePath('/health-rider/rider/scan')).toBe('/rider/scan');
    expect(withoutBasePath('/health-rider')).toBe('/');
    expect(withoutBasePath('/health-riders/x')).toBe('/health-riders/x');
  });

  it('does not touch URLs that are not app paths', async () => {
    const { withBasePath } = await load('/health-rider');
    expect(withBasePath('//evil.example/x')).toBe('//evil.example/x');
    expect(withBasePath('blob:abc')).toBe('blob:abc');
    expect(withBasePath('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
  });
});
