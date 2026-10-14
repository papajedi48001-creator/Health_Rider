import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

export default function PharmacyAwaitingRiderPage() {
  return (
    <main>
      <h1>รอไรเดอร์รับงาน</h1>
      <p>พัสดุที่ออก QR แล้วและรอไรเดอร์สแกนรับงาน หากฉลาก QR หายหรือชำรุดให้ออก QR ใหม่</p>
      <PharmacyPackageBoard view="awaiting" />
    </main>
  );
}
