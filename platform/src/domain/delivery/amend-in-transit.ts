import { requireRole, type SessionUser } from '@/auth/require-role';

type AmendmentData = { deliveryAddress?: string; telephone?: string; reason: string };
type AmendmentStore = {
  findInTransitRequest(requestId: string): Promise<{ id: string; deliveryVersion: number; hn: string; deliveryAddress: string; telephone: string | null } | null>;
  update(record: { id: string; deliveryVersion: number; deliveryAddress?: string; telephone?: string | null }): Promise<unknown>;
  createAudit(audit: { actorId: string; action: string; auditableId: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; reason: string }): Promise<unknown>;
};

export async function amendInTransit(requestId: string, data: AmendmentData, coordinator: SessionUser | null, store: AmendmentStore) {
  const actor = requireRole(coordinator, 'coordinator', 'admin');
  if ('hn' in (data as object) || 'packageId' in (data as object)) throw new Error('แก้ไข HN หรือข้อมูลพัสดุไม่ได้');
  if (!data.reason.trim()) throw new Error('ต้องระบุเหตุผลการแก้ไข');
  const request = await store.findInTransitRequest(requestId);
  if (!request) throw new Error('ไม่พบงานที่กำลังจัดส่ง');
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  if (data.deliveryAddress && data.deliveryAddress !== request.deliveryAddress) { oldValues.deliveryAddress = request.deliveryAddress; newValues.deliveryAddress = data.deliveryAddress; }
  if (data.telephone && data.telephone !== request.telephone) { oldValues.telephone = request.telephone; newValues.telephone = data.telephone; }
  const updated = { id: request.id, deliveryVersion: request.deliveryVersion + 1, ...newValues };
  await store.update(updated);
  await store.createAudit({ actorId: actor.id, action: 'delivery_request.amended_in_transit', auditableId: request.id, oldValues, newValues, reason: data.reason });
  return updated;
}
