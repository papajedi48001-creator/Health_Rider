import type { UserRole } from '@/auth/roles';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import type { FailedDeliveryReason, RecipientRelation } from '@/domain/delivery/offline-event-rules';

export const statusLabels: Record<DeliveryAttemptStatus, string> = {
  prepared: 'เตรียมพัสดุแล้ว รอไรเดอร์รับงาน',
  claimed: 'ไรเดอร์รับงานแล้ว',
  in_transit: 'กำลังนำส่ง',
  delivered: 'ส่งสำเร็จ',
  delivery_failed: 'ส่งไม่สำเร็จ',
  return_required: 'ส่งไม่สำเร็จ รอคืนยา',
  returned: 'รับยาคืนแล้ว',
  sync_review: 'รอผู้ประสานงานตรวจสอบ',
};

export const failureReasonLabels: Record<FailedDeliveryReason, string> = {
  recipient_unavailable: 'ไม่พบผู้รับ',
  address_not_found: 'หาที่อยู่ไม่พบ',
  recipient_declined: 'ผู้รับปฏิเสธการรับยา',
  unsafe_to_deliver: 'ไม่ปลอดภัยที่จะส่ง',
};

export const recipientRelationLabels: Record<RecipientRelation, string> = {
  self: 'ผู้ป่วยเอง',
  spouse: 'คู่สมรส',
  child: 'บุตร',
  parent: 'บิดา/มารดา',
  relative: 'ญาติ',
  caregiver: 'ผู้ดูแล',
  other: 'อื่น ๆ',
};

export const conflictReasonLabels: Record<string, string> = {
  version_mismatch: 'บันทึกก่อนข้อมูลจัดส่งถูกแก้ไข',
  invalid_transition: 'สถานะงานไม่รองรับรายการนี้',
};

export function shortCode(id: string): string {
  return id.slice(-6);
}

export function formatThaiDateTime(value: string | Date | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(value));
}

export const roleLabels: Record<UserRole, string> = {
  pharmacy: 'เภสัชกรรม', coordinator: 'ผู้ประสานงาน', rider: 'ไรเดอร์', admin: 'ผู้ดูแลระบบ', auditor: 'ผู้ตรวจสอบ',
};

export const employmentLabels: Record<string, string> = { internal: 'ไรเดอร์ภายใน', external: 'ไรเดอร์ภายนอก' };
