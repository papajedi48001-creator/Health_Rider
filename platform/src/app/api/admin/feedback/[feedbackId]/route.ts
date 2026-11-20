import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { parseFeedbackUpdate } from '@/domain/feedback/feedback-rules';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// An admin moves feedback along and answers the sender, who sees the answer under "ที่เคยส่ง".
export async function PATCH(request: NextRequest, context: { params: Promise<{ feedbackId: string }> }) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), 'admin');
    const { feedbackId } = await context.params;
    const update = parseFeedbackUpdate(await readJsonBody(request));
    const updated = await db.$transaction(async (tx) => {
      const current = await tx.feedback.findUnique({ where: { id: feedbackId }, select: { status: true, reply: true } });
      if (!current) throw new DomainError('ไม่พบความคิดเห็นนี้', 404);
      const replyChanged = update.reply !== undefined && update.reply !== current.reply;
      const result = await tx.feedback.update({
        where: { id: feedbackId },
        data: {
          ...(update.status ? { status: update.status } : {}),
          ...(replyChanged ? { reply: update.reply, repliedById: update.reply ? session.id : null, repliedAt: update.reply ? new Date() : null } : {}),
        },
        select: { id: true, status: true, reply: true, repliedAt: true },
      });
      await audit(tx, {
        actorId: session.id, action: 'feedback.updated', auditableType: 'Feedback', auditableId: feedbackId,
        oldValues: { status: current.status, ...(replyChanged ? { reply: current.reply } : {}) },
        newValues: { status: result.status, ...(replyChanged ? { reply: result.reply } : {}) },
      });
      return result;
    });
    return NextResponse.json({ ...updated, repliedByName: updated.reply ? session.displayName : null });
  });
}
