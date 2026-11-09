import { HeroBanner } from '@/brand/hero-banner';
import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

export default function PharmacyAwaitingRiderPage() {
  return (
    <main>
      <HeroBanner title="รอไรเดอร์รับงาน" text="พัสดุที่พร้อมแล้ว รอไรเดอร์สแกน QR เพื่อรับงาน" />
      <h1>รอไรเดอร์รับงาน</h1>
      <p>พัสดุที่ออก QR แล้วและรอไรเดอร์สแกนรับงาน กด "พิมพ์ซ้ำ" เพื่อพิมพ์ฉลากด้วย QR เดิม หากฉลากหายให้ออก QR ใหม่</p>
      <PharmacyPackageBoard view="awaiting" />
    </main>
  );
}
