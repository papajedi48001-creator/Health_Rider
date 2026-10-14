import { NextRequest, NextResponse } from 'next/server';
import { sessionStore } from '@/auth/current-session';
import { endSession, sessionCookieName } from '@/auth/session';
import { getAuthSecret } from '@/lib/env';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(sessionCookieName)?.value;
  if (token) {
    await endSession(token, new Date(), getAuthSecret(process.env), sessionStore);
  }

  // A relative Location keeps the redirect correct behind the hospital reverse proxy.
  const response = new NextResponse(null, { status: 303, headers: { location: '/login' } });
  response.cookies.delete(sessionCookieName);
  return response;
}
