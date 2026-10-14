import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { finishedAt, outcomeOf, pageOfHistory, parseHistoryQuery } from '@/domain/delivery/rider-history';
import { db } from '@/lib/db';
import { handleRoute, invalidInput } from '@/lib/route';

export const dynamic = 'force-dynamic';

// The signed-in rider's own delivered and failed attempts in a date range, ten per page.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const rider = requireRole(await getSessionFromRequest(request), 'rider');
    const query = parseHistoryQuery(request.nextUrl.searchParams);
    if ('error' in query) return invalidInput(query.error);

    const range = { gte: query.start, lt: query.end };
    const attempts = await db.deliveryAttempt.findMany({
      where: { riderId: rider.id, OR: [{ deliveredAt: range }, { failedAt: range }] },
      select: {
        id: true, status: true, deliveredAt: true, failedAt: true, failureReason: true,
        deliveryRequest: { select: { hn: true, patientName: true, deliveryAddress: true } },
        evidence: { select: { recipientRelation: true } },
      },
    });
    const result = pageOfHistory(attempts, query.outcome, query.page);

    return NextResponse.json({
      from: query.from,
      to: query.to,
      page: result.page,
      pages: result.pages,
      total: result.total,
      counts: result.counts,
      items: result.items.map((attempt) => ({
        id: attempt.id,
        outcome: outcomeOf(attempt),
        status: attempt.status,
        finishedAt: finishedAt(attempt).toISOString(),
        failureReason: attempt.failureReason,
        hasEvidence: attempt.evidence !== null,
        recipientRelation: attempt.evidence?.recipientRelation ?? null,
        hn: attempt.deliveryRequest.hn,
        patientName: attempt.deliveryRequest.patientName,
        address: attempt.deliveryRequest.deliveryAddress,
      })),
    }, { headers: { 'cache-control': 'no-store' } });
  });
}
