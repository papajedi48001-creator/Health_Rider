import { NextResponse } from 'next/server';
import { appVersion } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

// Open pages compare this with their own build to find out that a newer version was deployed.
export function GET() {
  return NextResponse.json({ version: appVersion }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
