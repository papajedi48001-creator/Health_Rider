import { NextRequest } from 'next/server';
import { expect, test } from 'vitest';
import { isForeignOriginRequest } from '@/lib/request-origin';

function request(headers: Record<string, string>) {
  return new NextRequest('http://app.example/api/me', { method: 'PATCH', headers: { host: 'app.example', ...headers } });
}

test('trusts Sec-Fetch-Site when the browser sends it', () => {
  expect(isForeignOriginRequest(request({ 'sec-fetch-site': 'cross-site', origin: 'http://app.example' }))).toBe(true);
  expect(isForeignOriginRequest(request({ 'sec-fetch-site': 'same-origin' }))).toBe(false);
});

test('compares Origin with the addressed host for older browsers', () => {
  expect(isForeignOriginRequest(request({ origin: 'https://evil.example' }))).toBe(true);
  expect(isForeignOriginRequest(request({ origin: 'https://app.example' }))).toBe(false);
  expect(isForeignOriginRequest(request({ origin: 'null' }))).toBe(true);
  expect(isForeignOriginRequest(request({}))).toBe(false);
});
