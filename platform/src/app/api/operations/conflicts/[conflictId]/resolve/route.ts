import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/auth/current-session';
import { requireAttemptInScope } from '@/auth/coordinator-scope';
import { requireRole } from '@/auth/require-role';
import { audit } from '@/domain/audit/write-audit-event';
import { conflictOutcomes, resolveSyncConflict, type ConflictOutcome } from '@/domain/delivery/resolve-sync-conflict';
import { newPublicId } from '@/domain/delivery/status';
import { db } from '@/lib/db';
import { readJsonBody } from '@/lib/http';
import { handleRoute, invalidInput } from '@/lib/route';

export async function POST(request: NextRequest, context: { params: Promise<{ conflictId: string }> }) {
  return handleRoute(async () => {
    const coordinator = requireRole(await getSessionFromRequest(request), 'pharmacy', 'coordinator', 'admin');
    const { conflictId } = await context.params;
    await requireAttemptInScope(db, coordinator, { syncConflicts: { some: { id: conflictId } } }, 'ไม่พบรายการนี้');
    const body = await readJsonBody(request) as { outcome?: unknown; resolution?: unknown } | undefined;
    if (!body || typeof body.resolution !== 'string' || !conflictOutcomes.includes(body.outcome as ConflictOutcome)) {
      return invalidInput('ต้องเลือกผลการตรวจสอบและระบุเหตุผล');
    }
    const outcome = body.outcome as ConflictOutcome;
    const resolution = body.resolution;

    const resolved = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM sync_conflicts WHERE id = ${conflictId} FOR UPDATE`;
      return resolveSyncConflict(conflictId, outcome, resolution, coordinator, {
        findPending: async (id) => {
          const conflict = await tx.syncConflict.findUnique({
            where: { id },
            select: { id: true, status: true, deliveryAttemptId: true, previousStatus: true, offlineDeliveryEvent: { select: { eventType: true, payload: true, deviceCapturedAt: true } } },
          });
          return conflict && {
            ...conflict,
            event: { ...conflict.offlineDeliveryEvent, payload: (conflict.offlineDeliveryEvent.payload ?? {}) as Record<string, unknown> },
          };
        },
        otherPendingCount: (attemptId, id) => tx.syncConflict.count({ where: { deliveryAttemptId: attemptId, status: 'pending', id: { not: id } } }),
        updateConflict: ({ id, ...changes }) => tx.syncConflict.update({ where: { id }, data: changes }),
        updateAttempt: (attemptId, update) => tx.deliveryAttempt.update({ where: { id: attemptId }, data: update }),
        createEvidence: (record) => tx.deliveryEvidence.create({ data: { id: newPublicId(), ...record } }),
        createAudit: (entry) => audit(tx, { ...entry, auditableType: 'DeliveryAttempt' }),
      });
    });
    return NextResponse.json(resolved);
  });
}
