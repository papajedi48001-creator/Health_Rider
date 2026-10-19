import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The รพ.สต. names to choose from; public because the registration page needs them before sign-in.
export async function GET() {
  return handleRoute(async () => {
    const healthCenters = await db.healthCenter.findMany({ orderBy: { name: 'asc' }, select: { name: true } });
    return NextResponse.json({ names: healthCenters.map((center) => center.name) }, { headers: { 'cache-control': 'no-store' } });
  });
}
