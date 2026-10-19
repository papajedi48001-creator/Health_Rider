import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireAttemptInScope } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { readEvidencePhoto } from '@/evidence/photo-storage';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// A rider sees the evidence photo only for a delivery they made; coordinators and admins see any. Never cached.
export async function GET(request: NextRequest, context: { params: Promise<{ attemptId: string }> }) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), 'rider', 'pharmacy', 'coordinator', 'admin');
    const { attemptId } = await context.params;
    await requireAttemptInScope(db, session, { id: attemptId }, 'ไม่พบรูปหลักฐาน');
    const evidence = await db.deliveryEvidence.findUnique({
      where: { deliveryAttemptId: attemptId },
      select: { photoPath: true, deliveryAttempt: { select: { riderId: true } } },
    });
    if (!evidence || (session.role === 'rider' && evidence.deliveryAttempt.riderId !== session.id)) {
      return NextResponse.json({ message: 'ไม่พบรูปหลักฐาน' }, { status: 404 });
    }
    const photo = await readEvidencePhoto(evidence.photoPath);
    if (!photo) return NextResponse.json({ message: 'ไม่พบรูปหลักฐาน' }, { status: 404 });
    return new NextResponse(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store, private' } });
  });
}
