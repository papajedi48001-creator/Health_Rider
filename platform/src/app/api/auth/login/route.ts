import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions, sessionStore } from '@/auth/current-session';
import { LoginThrottle } from '@/auth/login-throttle';
import { roleHome, safeNextPath } from '@/auth/role-home';
import { sessionCookieName, startSession, verifyLoginPassword } from '@/auth/session';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { withBasePath } from '@/lib/base-path';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';
import { readJsonBody } from '@/lib/http';
import { clientAddress, isCrossSiteRequest } from '@/lib/request-origin';

const usernameThrottle = new LoginThrottle(10);
// Wider limit per client address, so changing the username tried does not lift the limit.
const addressThrottle = new LoginThrottle(50);
const invalidCredentials = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

type LoginBody = { username?: unknown; password?: unknown; next?: unknown };

// Accepts JSON from the login form script, and a plain form post if the page is used before its script loads
// (so credentials are never sent in a URL).
export async function POST(request: NextRequest) {
  // Another site may not sign this browser in to an account of its choosing.
  if (isCrossSiteRequest(request)) return NextResponse.json({ message: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' }, { status: 403 });
  const isFormPost = request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') ?? false;
  const body = isFormPost ? Object.fromEntries(await request.formData()) as LoginBody : await readJsonBody(request) as LoginBody | undefined;
  const next = typeof body?.next === 'string' ? safeNextPath(body.next) : null;
  const fail = (message: string, status: number) => (isFormPost
    ? redirectTo(`/login?error=${status}${next ? `&next=${encodeURIComponent(next)}` : ''}`)
    : NextResponse.json({ message }, { status }));

  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || !body.username.trim() || !body.password) {
    return fail('กรุณากรอกชื่อผู้ใช้และรหัสผ่าน', 422);
  }

  // Usernames are stored in lower case and the column ignores case, so "Admin" must count as "admin".
  const username = body.username.trim().toLowerCase();
  const address = clientAddress(request);
  const now = new Date();
  if (usernameThrottle.isBlocked(username, now.getTime()) || (address && addressThrottle.isBlocked(address, now.getTime()))) {
    return fail('เข้าสู่ระบบผิดหลายครั้ง โปรดรอ 15 นาทีแล้วลองใหม่', 429);
  }

  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, role: true, active: true, pendingApproval: true, passwordHash: true },
  });
  const passwordMatches = await verifyLoginPassword(body.password, user?.passwordHash ?? null);
  // Only someone who knows the password learns that the application is still waiting.
  if (user && passwordMatches && user.pendingApproval) return fail('บัญชีนี้รอผู้ดูแลระบบอนุมัติ เมื่ออนุมัติแล้วจะเข้าสู่ระบบได้', 403);
  if (!user || !passwordMatches || !user.active) {
    usernameThrottle.recordFailure(username, now.getTime());
    if (address) addressThrottle.recordFailure(address, now.getTime());
    return fail(invalidCredentials, 401);
  }

  usernameThrottle.reset(username);
  const session = await db.$transaction(async (tx) => {
    const started = await startSession(user.id, now, getAuthSecret(process.env), {
      ...sessionStore,
      create: (record) => tx.session.create({ data: record }),
    });
    await writeAuditEvent(tx.auditEvent, {
      id: newPublicId(), actorId: user.id, action: 'user.logged_in', auditableType: 'User', auditableId: user.id,
      reason: null, oldValues: null, newValues: null,
    });
    return started;
  });

  const response = isFormPost ? redirectTo(next ?? roleHome(user.role)) : NextResponse.json({ redirectTo: roleHome(user.role) });
  response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.expiresAt, user.role));
  return response;
}

function redirectTo(location: string) {
  // Paths here are the app's own routes; the browser needs them under the base path.
  return new NextResponse(null, { status: 303, headers: { location: withBasePath(location) } });
}

