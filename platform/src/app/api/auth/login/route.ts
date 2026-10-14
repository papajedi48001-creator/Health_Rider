import { NextRequest, NextResponse } from 'next/server';
import { sessionCookieOptions, sessionStore } from '@/auth/current-session';
import { LoginThrottle } from '@/auth/login-throttle';
import { roleHome } from '@/auth/role-home';
import { sessionCookieName, startSession, verifyLoginPassword } from '@/auth/session';
import { writeAuditEvent } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';
import { readJsonBody } from '@/lib/http';

const throttle = new LoginThrottle();
const invalidCredentials = 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';

export async function POST(request: NextRequest) {
  const body = await readJsonBody(request) as { username?: unknown; password?: unknown } | undefined;
  if (!body || typeof body.username !== 'string' || typeof body.password !== 'string' || !body.username.trim() || !body.password) {
    return NextResponse.json({ message: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' }, { status: 422 });
  }

  const username = body.username.trim();
  const now = new Date();
  if (throttle.isBlocked(username, now.getTime())) {
    return NextResponse.json({ message: 'เข้าสู่ระบบผิดหลายครั้ง โปรดรอ 15 นาทีแล้วลองใหม่' }, { status: 429 });
  }

  const user = await db.user.findUnique({
    where: { username },
    select: { id: true, role: true, active: true, passwordHash: true },
  });
  const passwordMatches = await verifyLoginPassword(body.password, user?.passwordHash ?? null);
  if (!user || !passwordMatches || !user.active) {
    throttle.recordFailure(username, now.getTime());
    return NextResponse.json({ message: invalidCredentials }, { status: 401 });
  }

  throttle.reset(username);
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

  const response = NextResponse.json({ redirectTo: roleHome(user.role) });
  response.cookies.set(sessionCookieName, session.token, sessionCookieOptions(session.expiresAt));
  return response;
}
