import type { NextRequest } from 'next/server';

// Caddy replaces any X-Forwarded-For sent by the client with the connecting address, so the last entry is
// the real client. The web port is only published on 127.0.0.1 when Caddy is in front (see compose.yaml).
export function clientAddress(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || null;
}

// True when another website made the browser send this request (a form or script on a foreign page).
export function isCrossSiteRequest(request: NextRequest): boolean {
  return request.headers.get('sec-fetch-site') === 'cross-site';
}
