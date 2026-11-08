import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';
import { activeRiderWhere, currentLicense, deliveriesThisMonth } from '@/license/license-store';

export const dynamic = 'force-dynamic';

// The license box on the settings page: the installation ID, the key in use, and what it allows against use.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const [license, activeRiders, deliveries] = await Promise.all([
      currentLicense(),
      db.user.count({ where: activeRiderWhere }),
      deliveriesThisMonth(),
    ]);
    return NextResponse.json({ license, activeRiders, deliveriesThisMonth: deliveries });
  });
}
