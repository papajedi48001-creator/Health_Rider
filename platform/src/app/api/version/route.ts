import { NextResponse } from 'next/server';
import { appVersion } from '@/lib/app-version';
import { runningRelease } from '@/domain/system-update/bundled-release';

export const dynamic = 'force-dynamic';

// Open pages compare version with their own build to find out that a newer version was deployed; the
// host updater checks release after an update or rollback to confirm the new build is the one answering.
export function GET() {
  return NextResponse.json({ version: appVersion, release: runningRelease.version }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
