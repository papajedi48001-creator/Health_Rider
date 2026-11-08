import { NextRequest, NextResponse } from 'next/server';
import { LoginThrottle } from '@/auth/login-throttle';
import { hashPassword } from '@/auth/session';
import { audit } from '@/domain/audit/write-audit-event';
import { parseRegistration } from '@/domain/admin/registration-rules';
import { newPublicId } from '@/domain/delivery/status';
import { knownHealthCenter } from '@/domain/admin/health-centers';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { clientAddress, isCrossSiteRequest } from '@/lib/request-origin';
import { handleRoute } from '@/lib/route';

// Five applications per address in 15 minutes, and a cap on applications waiting, so the open form
// cannot be used to flood the user table.
const addressThrottle = new LoginThrottle(5);
const maximumPendingRegistrations = 50;

// Anyone may apply for an account; it is created inactive and waits for an admin to approve it.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    if (isCrossSiteRequest(request)) return NextResponse.json({ message: 'ไม่อนุญาตคำขอจากเว็บไซต์อื่น' }, { status: 403 });
    const address = clientAddress(request);
    const now = Date.now();
    if (address && addressThrottle.isBlocked(address, now)) {
      return NextResponse.json({ message: 'ส่งคำขอสมัครหลายครั้งเกินไป โปรดรอ 15 นาทีแล้วลองใหม่' }, { status: 429 });
    }
    const registration = parseRegistration(await readJsonBody(request));
    await knownHealthCenter(db, registration.healthCenter);
    if (address) addressThrottle.recordFailure(address, now);
    if (await db.user.count({ where: { pendingApproval: true } }) >= maximumPendingRegistrations) {
      return NextResponse.json({ message: 'มีคำขอสมัครรออนุมัติจำนวนมาก โปรดติดต่อผู้ดูแลระบบ' }, { status: 429 });
    }

    if (await db.user.findUnique({ where: { username: registration.username }, select: { id: true } })) {
      return NextResponse.json({ message: 'ชื่อผู้ใช้นี้มีผู้ใช้แล้ว โปรดเลือกชื่ออื่น' }, { status: 409 });
    }
    const passwordHash = await hashPassword(registration.password);
    await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: newPublicId(), username: registration.username, displayName: registration.displayName, phone: registration.phone,
          healthCenter: registration.healthCenter,
          role: registration.role, passwordHash, active: false, pendingApproval: true,
        },
        select: { id: true },
      });
      await audit(tx, {
        actorId: created.id, action: 'user.registered', auditableType: 'User', auditableId: created.id,
        newValues: { username: registration.username, requestedRole: registration.role, healthCenter: registration.healthCenter },
      });
    });
    return NextResponse.json({ pendingApproval: true }, { status: 201 });
  });
}
