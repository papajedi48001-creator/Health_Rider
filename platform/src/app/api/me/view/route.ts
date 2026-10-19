import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { roleHome } from '@/auth/role-home';
import { isAdminView, viewCookieName } from '@/auth/view-as';
import { DomainError } from '@/domain/errors';
import { basePath } from '@/lib/base-path';
import { readJsonBody } from '@/lib/http';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Switches which role's menu an admin sees, and says which page to open for it.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const view = (await readJsonBody(request) as { view?: unknown } | undefined)?.view;
    if (!isAdminView(view)) throw new DomainError('มุมมองไม่ถูกต้อง');
    const response = NextResponse.json({ view, home: roleHome(view) });
    response.cookies.set(viewCookieName, view, { httpOnly: true, sameSite: 'lax', path: basePath || '/' });
    return response;
  });
}
