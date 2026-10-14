import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

export default function PharmacyPackagesPage() {
  return (
    <main>
      <h1>เตรียมพัสดุและพิมพ์ QR</h1>
      <p>เภสัชกรรมสร้าง QR สำหรับพัสดุหนึ่งชิ้นต่อการรับงานหนึ่งครั้ง QR ไม่มีชื่อผู้ป่วยหรือ HN</p>
      <PharmacyPackageBoard />
    </main>
  );
}
