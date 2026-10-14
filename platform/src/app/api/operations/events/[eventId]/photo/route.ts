import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { readEvidencePhoto } from '@/evidence/photo-storage';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

// Evidence photos are shown only to staff who review deliveries, and never cached by the browser.
export async function GET(request: NextRequest, context: { params: Promise<{ eventId: string }> }) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const { eventId } = await context.params;
    const event = await db.offlineDeliveryEvent.findUnique({ where: { id: eventId }, select: { payload: true } });
    const photoPath = (event?.payload as Record<string, unknown> | null)?.photoPath;
    if (typeof photoPath !== 'string') return NextResponse.json({ message: 'ไม่พบรูปหลักฐาน' }, { status: 404 });
    const photo = await readEvidencePhoto(photoPath);
    return new NextResponse(new Uint8Array(photo), { headers: { 'content-type': 'image/jpeg', 'cache-control': 'no-store' } });
  });
}
