import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/session';
import { createMysqlHosCandidateRepository } from '@/hos/mysql-candidate-repository';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    requireRole(getSessionFromRequest(request), 'pharmacy', 'admin');
    const requestedDate = request.nextUrl.searchParams.get('date');
    const on = requestedDate ? new Date(`${requestedDate}T00:00:00.000Z`) : new Date();
    if (Number.isNaN(on.getTime())) {
      return NextResponse.json({ message: 'วันที่ค้นหาไม่ถูกต้อง' }, { status: 422 });
    }

    const candidates = await createMysqlHosCandidateRepository(process.env).eligibleFor(on);
    return NextResponse.json(candidates);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    throw error;
  }
}
