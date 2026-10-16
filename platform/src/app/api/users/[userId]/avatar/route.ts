import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles } from '@/auth/roles';
import { readAvatar } from '@/account/avatar-storage';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Any signed-in user may see profile photos. The page asks with ?v=<version>, so the browser may keep each version.
export async function GET(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), ...userRoles);
    const photo = await readAvatar((await context.params).userId);
    if (!photo) return NextResponse.json({ message: 'ไม่พบรูปโปรไฟล์' }, { status: 404 });
    return new NextResponse(new Uint8Array(photo), {
      headers: { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=31536000, immutable' },
    });
  });
}
