import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Riders to suggest in the history search, including deactivated ones whose past jobs are still searchable.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const viewer = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const profiles = await db.riderProfile.findMany({
      // A coordinator is offered only the riders of their own รพ.สต.
      ...(viewer.role === 'coordinator' ? { where: { user: { healthCenter: viewer.healthCenter ?? { in: [] } } } } : {}),
      orderBy: { riderCode: 'asc' },
      select: { riderCode: true, user: { select: { id: true, displayName: true } } },
    });
    return NextResponse.json({ riders: profiles.map((profile) => ({ id: profile.user.id, displayName: profile.user.displayName, riderCode: profile.riderCode })) });
  });
}
