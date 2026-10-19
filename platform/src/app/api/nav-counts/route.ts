import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireRole } from '@/auth/require-role';
import { userRoles, type UserRole } from '@/auth/roles';
import { refreshJobsFromHos } from '@/domain/delivery/refresh-from-hos';
import { getHosCandidateRepository } from '@/hos/mysql-candidate-repository';
import { db } from '@/lib/db';
import { handleRoute } from '@/lib/route';

export const dynamic = 'force-dynamic';

// Pharmacy's package queues look back as far as the package board does.
const recentDays = 14;
// HOSxP is read at most once a minute for the menu count, however many pages are opened.
const candidateCacheMs = 60_000;
let candidateCache: { at: number; count: number } | null = null;

async function pendingCandidates(): Promise<number | null> {
  if (candidateCache && Date.now() - candidateCache.at < candidateCacheMs) return candidateCache.count;
  try {
    const candidates = await (await getHosCandidateRepository()).eligibleFor(new Date());
    const confirmed = candidates.length === 0 ? 0 : await db.deliveryRequest.count({
      where: { hosVisitNumber: { in: candidates.map((candidate) => candidate.visitNumber) } },
    });
    candidateCache = { at: Date.now(), count: candidates.length - confirmed };
    return candidateCache.count;
  } catch {
    return null;
  }
}

async function packageQueues() {
  const requests = await db.deliveryRequest.findMany({
    where: { createdAt: { gte: new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000) } },
    select: { attempts: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } } },
  });
  const latest = requests.map((request) => request.attempts[0]?.status ?? null);
  return {
    toPrepare: latest.filter((status) => status === null || status === 'returned').length,
    awaitingRider: latest.filter((status) => status === 'prepared').length,
    returnRequired: latest.filter((status) => status === 'return_required').length,
  };
}

const can = (role: UserRole, ...roles: UserRole[]) => roles.includes(role);

// Work waiting behind each menu item the signed-in user can see, keyed by the item's path.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const session = requireRole(await getSessionFromRequest(request), ...userRoles);
    const counts: Record<string, number> = {};
    // Every signed-in page asks for counts, so this is where jobs saved without name titles or village names catch up after an update.
    void refreshJobsFromHos(getHosCandidateRepository, db);

    if (can(session.role, 'pharmacy', 'admin')) {
      const [candidates, queues] = await Promise.all([pendingCandidates(), packageQueues()]);
      if (candidates !== null) counts['/pharmacy/candidates'] = candidates;
      counts['/pharmacy/packages'] = queues.toPrepare;
      counts['/pharmacy/awaiting-rider'] = queues.awaitingRider;
      counts['/pharmacy/returns'] = queues.returnRequired;
    }
    if (can(session.role, 'coordinator', 'admin')) {
      const [inTransit, returns, conflicts] = await Promise.all([
        db.deliveryAttempt.count({ where: { status: { in: ['claimed', 'in_transit'] } } }),
        db.deliveryAttempt.count({ where: { status: 'return_required' } }),
        db.syncConflict.count({ where: { status: 'pending' } }),
      ]);
      counts['/operations'] = inTransit;
      counts['/operations/exceptions'] = returns + conflicts;
    }
    if (session.role === 'admin') {
      counts['/admin'] = await db.user.count({ where: { pendingApproval: true } });
    }
    if (session.role === 'rider') {
      counts['/rider/scan'] = await db.deliveryAttempt.count({
        where: { riderId: session.id, status: { in: ['claimed', 'in_transit', 'sync_review', 'return_required'] } },
      });
    }
    return NextResponse.json({ counts }, { headers: { 'cache-control': 'no-store' } });
  });
}
