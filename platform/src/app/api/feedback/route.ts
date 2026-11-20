import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { DomainError } from '@/domain/errors';
import { decodeFeedbackPhoto, saveFeedbackPhoto } from '@/domain/feedback/feedback-photo';
import { initialStatus, parseFeedbackInput } from '@/domain/feedback/feedback-rules';
import { newPublicId } from '@/domain/delivery/status';
import { appVersion } from '@/lib/app-version';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Any signed-in user may send feedback. A rating is the rider's own word on a delivery they finished, given once.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const input = parseFeedbackInput(await readJsonBody(request));
    if (input.kind === 'rating') {
      if (session.role !== 'rider') throw new DomainError('ให้คะแนนได้เฉพาะไรเดอร์ที่ส่งงานนี้');
      const attempt = await db.deliveryAttempt.findUnique({ where: { id: input.attemptId! }, select: { riderId: true, status: true } });
      if (!attempt || attempt.riderId !== session.id) throw new DomainError('ไม่พบงานจัดส่ง', 404);
      if (attempt.status !== 'delivered') throw new DomainError('ให้คะแนนได้หลังส่งยาสำเร็จแล้ว');
      if (await db.feedback.findUnique({ where: { deliveryAttemptId: input.attemptId! }, select: { id: true } })) {
        throw new DomainError('ให้คะแนนงานนี้ไปแล้ว', 409);
      }
    }
    const photo = input.photo ? decodeFeedbackPhoto(input.photo) : null;
    const id = newPublicId();
    if (photo) await saveFeedbackPhoto(id, photo);
    await db.feedback.create({
      data: {
        id,
        userId: session.id,
        role: session.role,
        kind: input.kind,
        rating: input.rating,
        tags: input.tags.length ? input.tags.join(',') : null,
        message: input.message,
        pagePath: input.pagePath,
        userAgent: input.userAgent,
        appVersion,
        deliveryAttemptId: input.attemptId,
        hasPhoto: photo !== null,
        status: initialStatus(input),
      },
    });
    return NextResponse.json({ id }, { status: 201 });
  });
}

// The signed-in user's own feedback, newest first, with the team's answers.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const items = await db.feedback.findMany({
      where: { userId: session.id, kind: { not: 'rating' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, kind: true, message: true, status: true, reply: true, repliedAt: true, createdAt: true },
    });
    return NextResponse.json({ items }, { headers: { 'cache-control': 'no-store' } });
  });
}
