import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { DomainError } from '@/domain/errors';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';
import { activateLicense, currentLicense } from '@/license/license-store';
import { vendorContact } from '@/license/vendor';

export const dynamic = 'force-dynamic';

// What the lock screen needs. The installation ID is only shown while locked; admins see it on the settings page.
export async function GET() {
  return handleRoute(async () => {
    const license = await currentLicense();
    return NextResponse.json({
      status: license.status,
      locked: license.locked,
      message: license.message,
      licensee: license.license?.licensee.name ?? null,
      installationId: license.locked ? license.installationId : null,
      contact: license.locked ? vendorContact : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

// Enters a token key. Anyone at the lock screen may, since only a key signed for this machine opens it; once
// the app is open, only an admin can change the key.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const current = await currentLicense();
    const actor = current.locked ? await getSessionFromRequest(request) : requireRole(await getSessionFromRequest(request), 'admin');
    const body = await readJsonBody(request) as { token?: unknown } | undefined;
    if (typeof body?.token !== 'string' || !body.token.trim()) throw new DomainError('โปรดวาง token key');
    const license = await activateLicense(body.token, actor?.role === 'admin' ? actor.id : null);
    return NextResponse.json({ status: license.status, locked: license.locked, message: license.message, licensee: license.license?.licensee.name ?? null });
  });
}
