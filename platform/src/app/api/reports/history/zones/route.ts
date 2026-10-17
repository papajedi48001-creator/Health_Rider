import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Subdistricts and village zones for the history search, including zones no longer in use.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'coordinator', 'admin');
    const zones = await db.deliveryZone.findMany({
      orderBy: [{ subdistrictCode: 'asc' }, { villageCode: 'asc' }],
      select: { id: true, subdistrictCode: true, subdistrictName: true, villageCode: true, displayName: true },
    });
    return NextResponse.json({ zones });
  });
}
