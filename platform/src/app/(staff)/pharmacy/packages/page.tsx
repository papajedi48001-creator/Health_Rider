import { HeroBanner } from '@/brand/hero-banner';
import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

export default function PharmacyPackagesPage() {
  return (
    <main>
      <HeroBanner title="เตรียมพัสดุ" text="พิมพ์ฉลาก QR และจัดพัสดุให้พร้อมสำหรับไรเดอร์" />
      <h1>เตรียมพัสดุและพิมพ์ QR</h1>
      <p>ติ๊กเลือกพิมพ์ทีละคน หรือกรองโซนแล้วเลือกทั้งหมด ฉลากมีชื่อและที่อยู่ผู้รับ ส่วน QR เก็บเฉพาะรหัสรับงาน</p>
      <PharmacyPackageBoard view="prepare" />
    </main>
  );
}
