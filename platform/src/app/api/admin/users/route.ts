import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import type { Prisma } from '@prisma/client';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { hashPassword } from '@/auth/session';
import { suggestRiderCode } from '@/domain/admin/rider-code';
import { parseNewUser } from '@/domain/admin/user-rules';
import { filterUsers, readUserFilters } from '@/domain/admin/user-filters';
import { toCsv } from '@/domain/reports/reports';
import { employmentLabels, formatThaiDateTime, roleLabels } from '@/lib/labels';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { knownHealthCenter } from '@/domain/admin/health-centers';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';
import { bangkokDateString } from '@/lib/time';

export const dynamic = 'force-dynamic';

const userSelect = {
  id: true, username: true, displayName: true, avatarUpdatedAt: true, phone: true, healthCenter: true, role: true, active: true, pendingApproval: true, createdAt: true,
  riderProfile: { select: { riderCode: true, employmentCategory: true } },
  roleGrants: { select: { role: true } },
  roleRequests: { where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { id: true, role: true, reason: true, createdAt: true } },
} as const;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function withRoles({ roleGrants, ...user }: SelectedUser) {
  return { ...user, roles: userRoles.filter((role) => roleGrants.some((grant) => grant.role === role)) };
}

// Every account with its roles and any role requests waiting; `format=csv` downloads the filtered list.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const rows = await db.user.findMany({ orderBy: [{ pendingApproval: 'desc' }, { role: 'asc' }, { username: 'asc' }], select: userSelect });
    const users = rows.map(withRoles);
    if (request.nextUrl.searchParams.get('format') !== 'csv') return NextResponse.json({ users });

    const params = request.nextUrl.searchParams;
    // The download matches the screen: closed accounts only when the admin chose to show them.
    const accounts = users.filter((user) => !user.pendingApproval && (user.active || params.get('inactive') === '1'));
    const shown = filterUsers(accounts, readUserFilters(params));
    const body = toCsv(
      ['ชื่อผู้ใช้', 'ชื่อที่แสดง', 'บทบาท', 'รพ.สต.', 'เบอร์โทร', 'รหัสไรเดอร์', 'ประเภทไรเดอร์', 'สถานะ', 'สร้างเมื่อ'],
      shown.map((user) => [
        user.username, user.displayName, user.roles.map((role) => roleLabels[role]).join(', '), user.healthCenter, user.phone,
        user.riderProfile?.riderCode ?? null, user.riderProfile ? employmentLabels[user.riderProfile.employmentCategory] ?? user.riderProfile.employmentCategory : null,
        user.active ? 'ใช้งาน' : 'ปิดใช้งาน', formatThaiDateTime(user.createdAt),
      ]),
    );
    return new Response(body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="users-${bangkokDateString(new Date())}.csv"`,
        'cache-control': 'no-store',
      },
    });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const input = parseNewUser(await readJsonBody(request));
    await knownHealthCenter(db, input.healthCenter);
    const passwordHash = await hashPassword(input.password);
    const user = await db.$transaction(async (tx) => {
      // Two admins saving at once can draw the same code; the unique index refuses the second and they save again.
      const rider = input.rider && { ...input.rider, riderCode: await suggestRiderCode(tx, input.rider.employmentCategory) };
      const created = await tx.user.create({
        data: {
          id: newPublicId(), username: input.username, displayName: input.displayName, role: input.role, passwordHash, mustChangePassword: true,
          phone: input.phone, healthCenter: input.healthCenter,
          ...(rider ? { riderProfile: { create: { id: newPublicId(), ...rider } } } : {}),
          roleGrants: { create: { role: input.role } },
        },
        select: userSelect,
      });
      await audit(tx, {
        actorId: admin.id, action: 'user.created', auditableType: 'User', auditableId: created.id,
        newValues: { username: created.username, role: created.role, riderCode: created.riderProfile?.riderCode ?? null },
      });
      return withRoles(created);
    });
    return NextResponse.json(user, { status: 201 });
  });
}
