import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { suggestRiderCode } from '@/domain/admin/rider-code';
import { employmentCategories, type EmploymentCategory } from '@/domain/admin/user-rules';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The code the account form shows in advance; the server assigns it again on save if the field is left empty.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const category = request.nextUrl.searchParams.get('category');
    if (!(employmentCategories as readonly unknown[]).includes(category)) throw new DomainError('ต้องเลือกประเภทไรเดอร์');
    return NextResponse.json({ riderCode: await suggestRiderCode(db, category as EmploymentCategory) });
  });
}
