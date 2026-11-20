import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { readFeedbackPhoto } from '@/domain/feedback/feedback-photo';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The screenshot sent with a piece of feedback; only admins read feedback.
export async function GET(request: NextRequest, context: { params: Promise<{ feedbackId: string }> }) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const photo = await readFeedbackPhoto((await context.params).feedbackId);
    if (!photo) return NextResponse.json({ message: 'ไม่พบรูป' }, { status: 404 });
    return new NextResponse(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  });
}
