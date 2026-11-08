import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { parseHealthCenterInput } from '@/domain/admin/health-centers';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

type Context = { params: Promise<{ healthCenterId: string }> };

// Renaming carries every account along, so nobody loses their area of responsibility.
export async function PATCH(request: NextRequest, context: Context) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { healthCenterId } = await context.params;
    const input = parseHealthCenterInput(await readJsonBody(request));
    const updated = await db.$transaction(async (tx) => {
      const before = await tx.healthCenter.findUnique({ where: { id: healthCenterId }, select: { name: true, hospcode: true } });
      if (!before) throw new DomainError('ไม่พบ รพ.สต.', 404);
      const after = await tx.healthCenter.update({ where: { id: healthCenterId }, data: input, select: { id: true, name: true, hospcode: true } });
      const moved = before.name === input.name ? 0 : (await tx.user.updateMany({ where: { healthCenter: before.name }, data: { healthCenter: input.name } })).count;
      await audit(tx, {
        actorId: admin.id, action: 'health_center.updated', auditableType: 'HealthCenter', auditableId: healthCenterId,
        oldValues: before, newValues: { ...input, ...(moved ? { usersMoved: moved } : {}) },
      });
      return after;
    });
    return NextResponse.json(updated);
  });
}

// A รพ.สต. that accounts still belong to cannot be removed; move them first.
export async function DELETE(request: NextRequest, context: Context) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { healthCenterId } = await context.params;
    await db.$transaction(async (tx) => {
      const before = await tx.healthCenter.findUnique({ where: { id: healthCenterId }, select: { name: true, hospcode: true } });
      if (!before) throw new DomainError('ไม่พบ รพ.สต.', 404);
      const members = await tx.user.count({ where: { healthCenter: before.name } });
      if (members > 0) throw new DomainError(`ยังมีบัญชีผู้ใช้ ${members} บัญชีอยู่ใน ${before.name} ย้ายบัญชีเหล่านั้นก่อนจึงจะลบได้`, 409);
      await tx.healthCenter.delete({ where: { id: healthCenterId } });
      await audit(tx, { actorId: admin.id, action: 'health_center.deleted', auditableType: 'HealthCenter', auditableId: healthCenterId, oldValues: before });
    });
    return new NextResponse(null, { status: 204 });
  });
}
