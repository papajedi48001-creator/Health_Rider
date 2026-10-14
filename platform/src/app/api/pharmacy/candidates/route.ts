import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/current-session';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { startOfBangkokDay } from '@/lib/time';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    requireRole(await getSessionFromRequest(request), 'pharmacy', 'admin');
    const requestedDate = request.nextUrl.searchParams.get('date');
    const on = requestedDate ? startOfBangkokDay(requestedDate) : new Date();
    if (!on) {
      return NextResponse.json({ message: 'วันที่ค้นหาไม่ถูกต้อง' }, { status: 422 });
    }

    const candidates = await getHosCandidateRepository(process.env).eligibleFor(on);
    return NextResponse.json(candidates);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ message: error.message }, { status: 403 });
    }
    throw error;
  }
}
