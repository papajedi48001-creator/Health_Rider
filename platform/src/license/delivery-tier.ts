import type { License } from '@/license/license';

// Admin notice when this month's delivery jobs pass the tier the license was priced for; work is never blocked.
export function deliveryTierNotice(license: License | null, deliveriesThisMonth: number): string | null {
  if (!license?.maxDeliveriesPerMonth || deliveriesThisMonth <= license.maxDeliveriesPerMonth) return null;
  return `เดือนนี้สร้างงานส่งยาแล้ว ${deliveriesThisMonth.toLocaleString('th-TH')} งาน เกินขั้นของ license (${license.maxDeliveriesPerMonth.toLocaleString('th-TH')} งานต่อเดือน) ระบบยังใช้งานได้ตามปกติ โปรดติดต่อผู้พัฒนาเพื่อปรับขั้นตอนต่ออายุ`;
}
