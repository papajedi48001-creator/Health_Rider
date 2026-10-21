import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { parseApproval } from '@/domain/admin/registration-rules';
import { suggestRiderCode } from '@/domain/admin/rider-code';
import { audit } from '@/domain/audit/write-audit-event';
import { newPublicId } from '@/domain/delivery/status';
import { DomainError } from '@/domain/errors';
import { knownHealthCenter } from '@/domain/admin/health-centers';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// Approving a self-registered account opens it with the role the admin confirms; rejecting keeps it closed.
export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { userId } = await context.params;
    const decision = parseApproval(await readJsonBody(request), userRoles);
    if (decision.decision === 'approve') await knownHealthCenter(db, decision.healthCenter);

    const updated = await db.$transaction(async (tx) => {
      const before = await tx.user.findUnique({ where: { id: userId }, select: { role: true, pendingApproval: true } });
      if (!before) throw new DomainError('ไม่พบบัญชีผู้ใช้', 404);
      // The conditional update makes two admins deciding at once safe: only the first one applies.
      const claimed = await tx.user.updateMany({
        where: { id: userId, pendingApproval: true },
        data: decision.decision === 'approve'
          ? { pendingApproval: false, active: true, role: decision.role, healthCenter: decision.healthCenter }
          : { pendingApproval: false, active: false },
      });
      if (claimed.count !== 1) throw new DomainError('คำขอนี้ได้รับการพิจารณาไปแล้ว', 409);
      if (decision.decision === 'approve') {
        await tx.userRoleGrant.createMany({ data: [{ userId, role: decision.role }], skipDuplicates: true });
      }
      let riderCode: string | null = null;
      if (decision.decision === 'approve' && decision.rider) {
        riderCode = await suggestRiderCode(tx, decision.rider.employmentCategory);
        await tx.riderProfile.create({ data: { id: newPublicId(), userId, riderCode, employmentCategory: decision.rider.employmentCategory } });
      }
      await audit(tx, {
        actorId: admin.id, action: decision.decision === 'approve' ? 'user.registration_approved' : 'user.registration_rejected',
        auditableType: 'User', auditableId: userId,
        oldValues: { requestedRole: before.role, active: false },
        newValues: decision.decision === 'approve'
          ? { role: decision.role, healthCenter: decision.healthCenter, active: true, riderCode }
          : { active: false },
      });
      return tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, username: true, role: true, active: true, pendingApproval: true } });
    });
    return NextResponse.json(updated);
  });
}
