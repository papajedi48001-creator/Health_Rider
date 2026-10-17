import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/auth/session-cookie';
import { isForeignOriginRequest } from '@/lib/request-origin';
import { requestNeedsWritableLicense } from '@/license/license';
import { currentLicenseState } from '@/license/license-store';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// API calls that change data must come from this site's own pages. Every page sends visitors without a
// session cookie to login; role checks happen in each section layout and API route.
// Without a usable license the app is read-only: saving calls are refused here, in one place, with the reason.
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (!safeMethods.has(request.method) && isForeignOriginRequest(request)) {
      return NextResponse.json({ message: 'คำขอนี้ต้องส่งจากหน้าของระบบเท่านั้น' }, { status: 403 });
    }
    if (requestNeedsWritableLicense(request.method, request.nextUrl.pathname)) {
      const license = await currentLicenseState();
      if (!license.writable) return NextResponse.json({ message: license.message }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (request.cookies.has(sessionCookieName)) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/api/:path*', '/pharmacy/:path*', '/operations/:path*', '/audit/:path*', '/admin/:path*', '/reports/:path*', '/account', '/rider/:path*'],
};
