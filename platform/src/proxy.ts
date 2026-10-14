import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/auth/session-cookie';

// Sends visitors without a session cookie to login; role checks happen in each section layout.
export function proxy(request: NextRequest) {
  if (request.cookies.has(sessionCookieName)) return NextResponse.next();

  const login = request.nextUrl.clone();
  login.pathname = '/login';
  login.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/pharmacy/:path*', '/operations/:path*', '/audit/:path*', '/rider/:path*'],
};
