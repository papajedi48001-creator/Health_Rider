import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/auth/session-cookie';
import { isForeignOriginRequest } from '@/lib/request-origin';
import { openWhileLockedPath } from '@/license/license';
import { currentLicenseState } from '@/license/license-store';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

function toLogin(request: NextRequest, keepNext: boolean) {
  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = keepNext ? `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}` : '';
  return NextResponse.redirect(login);
}

// API calls that change data must come from this site's own pages. Every page sends visitors without a
// session cookie to login; role checks happen in each section layout and API route.
// Without a usable license the app is locked: API calls are refused here, in one place, and every page leads
// to the login page, which shows the lock screen.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    if (!safeMethods.has(request.method) && isForeignOriginRequest(request)) {
      return NextResponse.json({ message: 'คำขอนี้ต้องส่งจากหน้าของระบบเท่านั้น' }, { status: 403 });
    }
    if (!openWhileLockedPath(pathname)) {
      const license = await currentLicenseState();
      if (license.locked) return NextResponse.json({ message: license.message, locked: true }, { status: 403 });
    }
    return NextResponse.next();
  }

  if ((await currentLicenseState()).locked) return toLogin(request, false);
  if (pathname === '/register' || request.cookies.has(sessionCookieName)) return NextResponse.next();
  return toLogin(request, true);
}

export const config = {
  matcher: ['/api/:path*', '/pharmacy/:path*', '/operations/:path*', '/audit/:path*', '/admin/:path*', '/reports/:path*', '/account', '/help', '/rider/:path*', '/select-role', '/register', '/dashboard/:path*'],
};
