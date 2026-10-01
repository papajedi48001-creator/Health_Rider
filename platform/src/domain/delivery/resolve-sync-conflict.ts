import { requireRole, type SessionUser } from '@/auth/require-role';

type ConflictStore = { findPending(conflictId: string): Promise<{ id: string; offlineDeliveryEventId: string; status: string } | null>; update(record: { id: string; status: 'resolved'; resolution: string; resolvedById: string; resolvedAt: Date }): Promise<unknown> };

export async function resolveSyncConflict(conflictId: string, resolution: string, coordinator: SessionUser | null, store: ConflictStore) {
  const actor = requireRole(coordinator, 'coordinator', 'admin');
  const conflict = await store.findPending(conflictId);
  if (!conflict || conflict.status !== 'pending') throw new Error('ไม่พบรายการขัดแย้งที่รอตรวจสอบ');
  if (!resolution.trim()) throw new Error('ต้องระบุผลการตรวจสอบ');
  return store.update({ id: conflict.id, status: 'resolved', resolution, resolvedById: actor.id, resolvedAt: new Date() });
}
