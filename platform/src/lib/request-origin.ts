import type { NextRequest } from 'next/server';

// The reverse proxy next to the app appends the address it received the request from, so the last entry is
// the client. Behind Cloudflare that address is a Cloudflare edge unless nginx first restores the visitor's
// address with real_ip (see docs/operations/production-waritch-hosp.md).
export function clientAddress(request: NextRequest): string | null {
  return request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() || null;
}

// True when another website made the browser send this request (a form or script on a foreign page).
export function isCrossSiteRequest(request: NextRequest): boolean {
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

// True when the request was sent by a page on another site. Browsers that predate Sec-Fetch-Site are
// judged by the Origin header against the host the visitor addressed.
export function isForeignOriginRequest(request: NextRequest): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite) return fetchSite === 'cross-site';
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
