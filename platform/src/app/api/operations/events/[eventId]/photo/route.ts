import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireAttemptInScope } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { readEvidencePhoto } from '@/evidence/photo-storage';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

// Evidence photos are shown only to staff who review deliveries, and never cached by the browser.
export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  return handleRoute(async () => {
    const viewer = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const { eventId } = await context.params;
    await requireAttemptInScope(db, viewer, { offlineEvents: { some: { id: eventId } } }, 'ไม่พบรูปหลักฐาน');
    const event = await db.offlineDeliveryEvent.findUnique({ where: { id: eventId }, select: { eventType: true, payload: true } });
    // Only a delivered event carries a photo, and its path is always written by the server.
    const photoPath = event?.eventType === 'delivered' ? (event.payload as Record<string, unknown> | null)?.photoPath : undefined;
    const photo = typeof photoPath === 'string' ? await readEvidencePhoto(photoPath) : null;
    if (!photo) return NextResponse.json({ message: 'ไม่พบรูปหลักฐาน' }, { status: 404 });
    return new NextResponse(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  });
}
