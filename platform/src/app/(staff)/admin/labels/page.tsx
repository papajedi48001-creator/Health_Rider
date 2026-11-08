import { HeroBanner } from '@/brand/hero-banner';
import { AdminLabels } from '@/app/(staff)/admin/admin-labels';

export default function AdminLabelsPage() {
  return (
    <main>
      <HeroBanner title="ตั้งค่าฉลาก QR" text="กำหนดขนาดและรูปแบบฉลากที่พิมพ์ติดพัสดุ" />
      <h1>ตั้งค่าฉลาก QR</h1>
      <AdminLabels />
    </main>
  );
}
