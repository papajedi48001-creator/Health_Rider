import { HeroBanner } from '@/brand/hero-banner';
import { AuditLog } from '@/app/(staff)/audit/audit-log';

export default function AuditPage() {
  return (
    <main>
      <HeroBanner title="ประวัติการตรวจสอบ" text="ย้อนดูการเปลี่ยนแปลงในระบบ ใครทำอะไร เมื่อไร" />
      <h1>ประวัติการตรวจสอบ</h1>
      <p>หน้าจอนี้สำหรับอ่านลำดับเหตุการณ์เท่านั้น ไม่มีการแก้ไขหรือการลบข้อมูล</p>
      <AuditLog />
    </main>
  );
}
