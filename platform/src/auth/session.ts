import bcrypt from 'bcryptjs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import type { SessionUser } from '@/auth/require-role';

const sessionCookieName = 'health_rider_session';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createSessionToken(session: SessionUser, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  const signature = sign(payload, secret);

  return `${payload}.${signature}`;
}

export function getSessionFromRequest(request: NextRequest): SessionUser | null {
  const token = request.cookies.get(sessionCookieName)?.value;
  const secret = process.env.AUTH_SECRET;

  if (!token || !secret) {
    return null;
  }

  const [payload, signature] = token.split('.');
  if (!payload || !signature || !isValidSignature(payload, signature, secret)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionUser;
    return decoded.id && decoded.role && decoded.displayName ? decoded : null;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function isValidSignature(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
