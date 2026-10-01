import { NextRequest, NextResponse } from 'next/server';
import { requireRole, UnauthorizedError } from '@/auth/require-role';
import { getSessionFromRequest } from '@/auth/session';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    requireRole(getSessionFromRequest(request), 'coordinator', 'admin', 'auditor');
    const [returns, conflicts] = await Promise.all([
      db.deliveryAttempt.findMany({ where: { status: 'return_required' }, select: { id: true, deliveryRequestId: true, failedAt: true } }),
      db.syncConflict.findMany({ where: { status: 'pending' }, select: { id: true, offlineDeliveryEventId: true, createdAt: true } }),
    ]);
    return NextResponse.json({ returns, conflicts });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ message: error.message }, { status: 403 });
    throw error;
  }
}
