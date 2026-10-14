import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { readEvidencePhoto } from '@/evidence/photo-storage';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The delivery photo of one of the signed-in rider's own attempts. Another rider's attempt answers 404
// like a missing one, and the photo is never cached by the browser or the service worker.
export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const { attemptId } = await context.params;
    const attempt = await db.deliveryAttempt.findFirst({
      where: { id: attemptId, riderId: rider.id },
      select: { evidence: { select: { photoPath: true } } },
    });
    const photoPath = attempt?.evidence?.photoPath;
    if (!photoPath) return NextResponse.json({ message: 'ไม่พบรูปหลักฐาน' }, { status: 404 });
    const photo = await readEvidencePhoto(photoPath);
    return new NextResponse(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  });
}
