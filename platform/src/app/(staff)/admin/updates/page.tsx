import { HeroBanner } from '@/brand/hero-banner';
import { AdminUpdates } from '@/app/(staff)/admin/admin-updates';

export default function AdminUpdatesPage() {
  return (
    <main>
      <HeroBanner title="อัปเดตระบบ" text="ดูว่าแต่ละเวอร์ชันมีอะไรใหม่ อัปเดตเป็นเวอร์ชันใหม่ หรือย้อนกลับเมื่อพบปัญหา" />
      <h1>อัปเดตระบบ</h1>
      <AdminUpdates />
    </main>
  );
}
