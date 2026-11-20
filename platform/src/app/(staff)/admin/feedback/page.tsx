import { HeroBanner } from '@/brand/hero-banner';
import { AdminFeedback } from '@/app/(staff)/admin/admin-feedback';

export default function AdminFeedbackPage() {
  return (
    <main>
      <HeroBanner title="กล่องความคิดเห็น" text="รวมเรื่องที่เภสัชกรและไรเดอร์ส่งมา ตอบกลับแล้วผู้ส่งเห็นในแท็บ ที่เคยส่ง" />
      <h1>กล่องความคิดเห็น</h1>
      <p>ดูเรื่องใหม่ เปลี่ยนสถานะ และตอบกลับผู้ส่ง คะแนนหลังส่งงานที่ไม่มีข้อติดขัดถูกเก็บเป็นแก้ไขแล้วโดยอัตโนมัติ</p>
      <AdminFeedback />
    </main>
  );
}
