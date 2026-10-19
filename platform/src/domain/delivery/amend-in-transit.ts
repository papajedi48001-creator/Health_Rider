import { DomainError } from '@/domain/errors';
import { requireRole, type SessionUser } from '@/auth/require-role';

type AmendmentData = { deliveryAddress?: string; telephone?: string; reason: string; expectedVersion: number };
// All calls run inside one database transaction.
type AmendmentStore = {
  findInTransitRequest(requestId: string): Promise<{ id: string; deliveryVersion: number; hn: string; deliveryAddress: string; telephone: string | null } | null>;
  update(record: { id: string; fromVersion: number; deliveryVersion: number; deliveryAddress?: string; telephone?: string | null }): Promise<boolean>;
  createAudit(audit: { actorId: string; action: string; auditableId: string; oldValues: Record<string, unknown>; newValues: Record<string, unknown>; reason: string }): Promise<unknown>;
};

export class StaleDeliveryVersionError extends DomainError {
  constructor() {
    super('ข้อมูลงานถูกแก้ไขโดยผู้อื่นแล้ว โปรดโหลดข้อมูลล่าสุดก่อนแก้ไข', 409);
  }
}

export async function amendInTransit(requestId: string, data: AmendmentData, coordinator: SessionUser | null, store: AmendmentStore) {
  const actor = requireRole(coordinator, 'pharmacy', 'coordinator', 'admin');
  if ('hn' in (data as object) || 'packageId' in (data as object)) throw new DomainError('แก้ไข HN หรือข้อมูลพัสดุไม่ได้');
  if (!data.reason.trim()) throw new DomainError('ต้องระบุเหตุผลการแก้ไข');
  const request = await store.findInTransitRequest(requestId);
  if (!request) throw new DomainError('ไม่พบงานที่กำลังจัดส่ง');
  if (request.deliveryVersion !== data.expectedVersion) throw new StaleDeliveryVersionError();
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  if (data.deliveryAddress && data.deliveryAddress !== request.deliveryAddress) { oldValues.deliveryAddress = request.deliveryAddress; newValues.deliveryAddress = data.deliveryAddress; }
  if (data.telephone && data.telephone !== request.telephone) { oldValues.telephone = request.telephone; newValues.telephone = data.telephone; }
  if (Object.keys(newValues).length === 0) throw new DomainError('ไม่มีข้อมูลที่เปลี่ยนแปลง');
  const updated = { id: request.id, deliveryVersion: request.deliveryVersion + 1, ...newValues };
  if (!(await store.update({ ...updated, fromVersion: request.deliveryVersion }))) throw new StaleDeliveryVersionError();
  await store.createAudit({ actorId: actor.id, action: 'delivery_request.amended_in_transit', auditableId: request.id, oldValues: { ...oldValues, deliveryVersion: request.deliveryVersion }, newValues: { ...newValues, deliveryVersion: updated.deliveryVersion }, reason: data.reason });
  return updated;
}
