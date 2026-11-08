import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { parseRoleRequestDecision, setUserRoles } from '@/domain/admin/user-roles';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

// Approving a role request adds the role to the account; rejecting leaves the account as it is.
export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  return handleRoute(async () => {
    const admin = requireRole(await getSessionFromRequest(request), 'admin');
    const { requestId } = await context.params;
    const decision = parseRoleRequestDecision(await readJsonBody(request));
    const now = new Date();

    const decided = await db.$transaction(async (tx) => {
      const asked = await tx.roleRequest.findUnique({ where: { id: requestId }, select: { userId: true, role: true } });
      if (!asked) throw new DomainError('ไม่พบคำขอ', 404);
      // The conditional update makes two admins deciding at once safe: only the first one applies.
      const claimed = await tx.roleRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: decision.decision === 'approve' ? 'approved' : 'rejected', decidedById: admin.id, decidedAt: now },
      });
      if (claimed.count !== 1) throw new DomainError('คำขอนี้ได้รับการพิจารณาไปแล้ว', 409);
      let riderCode: string | null = null;
      if (decision.decision === 'approve') {
        const held = await tx.userRoleGrant.findMany({ where: { userId: asked.userId }, select: { role: true } });
        const roles = userRoles.filter((role) => role === asked.role || held.some((grant) => grant.role === role));
        riderCode = (await setUserRoles(tx, asked.userId, { roles, rider: decision.rider })).riderCode;
      }
      await audit(tx, {
        actorId: admin.id, action: decision.decision === 'approve' ? 'user.role_request_approved' : 'user.role_request_rejected',
        auditableType: 'User', auditableId: asked.userId,
        newValues: { requestedRole: asked.role, ...(riderCode ? { riderCode } : {}) },
      });
      return { ...asked, status: decision.decision === 'approve' ? 'approved' : 'rejected' };
    });
    return NextResponse.json(decided);
  });
}
