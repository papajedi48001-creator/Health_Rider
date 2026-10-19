import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/auth/session-cookie';
import { isForeignOriginRequest } from '@/lib/request-origin';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

// API calls that change data must come from this site's own pages. Every page sends visitors without a
// session cookie to login; role checks happen in each section layout and API route.
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    if (!safeMethods.has(request.method) && isForeignOriginRequest(request)) {
      return NextResponse.json({ message: 'คำขอนี้ต้องส่งจากหน้าของระบบเท่านั้น' }, { status: 403 });
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
  matcher: ['/api/:path*', '/pharmacy/:path*', '/operations/:path*', '/audit/:path*', '/admin/:path*', '/reports/:path*', '/account', '/help', '/rider/:path*'],
};
