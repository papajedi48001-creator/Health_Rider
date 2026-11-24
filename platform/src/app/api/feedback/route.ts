import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { decodeFeedbackPhoto, saveFeedbackPhoto } from '@/domain/feedback/feedback-photo';
import { initialStatus, parseFeedbackInput } from '@/domain/feedback/feedback-rules';
import { newPublicId } from '@/domain/delivery/status';
import { appVersion } from '@/lib/app-version';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Any signed-in user may send feedback, from the button on staff pages or the rider app.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const input = parseFeedbackInput(await readJsonBody(request));
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
