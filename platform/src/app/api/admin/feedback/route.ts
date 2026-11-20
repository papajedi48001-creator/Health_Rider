import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { feedbackKinds, type FeedbackKind } from '@/domain/feedback/feedback-rules';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

const pageSize = 50;
const recentDays = 30;
const statusFilters: Record<string, Prisma.FeedbackWhereInput['status']> = {
  open: { in: ['new', 'in_progress'] },
  new: 'new',
  in_progress: 'in_progress',
  resolved: 'resolved',
  all: undefined,
};

// The admin's inbox: what users sent, filtered by kind and status, with the month's totals above it.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    requireRole(await getSessionFromRequest(request), 'admin');
    const params = request.nextUrl.searchParams;
    const kind = params.get('kind') as FeedbackKind | null;
    const statusKey = params.get('status') ?? 'open';
    const status = statusKey in statusFilters ? statusFilters[statusKey] : statusFilters.open;
    const before = params.get('before');
    const where: Prisma.FeedbackWhereInput = {
      ...(kind && feedbackKinds.includes(kind) ? { kind } : {}),
      ...(status ? { status } : {}),
    };
    const since = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000);

    const [items, byKind, byStatus, resolvedRecently, ratings] = await Promise.all([
      db.feedback.findMany({
        where: { ...where, ...(before ? { id: { lt: before } } : {}) },
        orderBy: { id: 'desc' },
        take: pageSize,
        include: { user: { select: { displayName: true } }, repliedBy: { select: { displayName: true } } },
      }),
      db.feedback.groupBy({ by: ['kind'], where: status ? { status } : {}, _count: { _all: true } }),
      db.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
      db.feedback.count({ where: { status: 'resolved', kind: { not: 'rating' }, updatedAt: { gte: since } } }),
      db.feedback.aggregate({ where: { kind: 'rating', createdAt: { gte: since } }, _avg: { rating: true }, _count: { rating: true } }),
    ]);
    const statusCount = (value: string) => byStatus.find((row) => row.status === value)?._count?._all ?? 0;

    return NextResponse.json({
      items: items.map(({ user, repliedBy, ...item }) => ({ ...item, userName: user.displayName, repliedByName: repliedBy?.displayName ?? null })),
      nextBefore: items.length === pageSize ? items[items.length - 1]?.id : null,
      kindCounts: Object.fromEntries(byKind.map((row) => [row.kind, row._count?._all ?? 0])),
      stats: {
        new: statusCount('new'),
        inProgress: statusCount('in_progress'),
        resolvedRecently,
        averageRating: ratings._avg.rating === null ? null : Math.round(ratings._avg.rating * 10) / 10,
        ratingCount: ratings._count.rating,
      },
    }, { headers: { 'cache-control': 'no-store' } });
  });
}
