import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Zones in use, for moving a job to another subdistrict and village in the edit pop-up.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const zones = await db.deliveryZone.findMany({
      where: { active: true },
      orderBy: [{ subdistrictCode: 'asc' }, { villageCode: 'asc' }],
      select: { id: true, subdistrictCode: true, subdistrictName: true, villageCode: true, displayName: true },
    });
    return NextResponse.json({ zones });
  });
}
