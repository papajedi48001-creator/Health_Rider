import { PharmacyPackageBoard } from '@/app/(staff)/pharmacy/packages/pharmacy-package-board';

export default function PharmacyReturnsPage() {
  return (
    <main>
      <h1>รอรับยาคืน</h1>
      <p>ยาที่ส่งไม่สำเร็จ ไรเดอร์ต้องนำกลับมาคืนเภสัชกรรมภายในวันเดียวกัน</p>
      <PharmacyPackageBoard view="returns" />
    </main>
  );
}
