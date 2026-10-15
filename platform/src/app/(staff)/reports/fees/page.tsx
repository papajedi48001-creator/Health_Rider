import { FeeReport } from '@/app/(staff)/reports/fees/fee-report';

export default function FeeReportPage() {
  return (
    <main>
      <h1>ค่าบริการไรเดอร์</h1>
      <p>คิดค่าบริการเฉพาะงานที่ส่งสำเร็จ ตามราคาที่ใช้ในวันที่เภสัชกรยืนยันรายการ ถ้าโซนไม่มีราคาจะใช้ราคาตำบล ดาวน์โหลด CSV เพื่อดูรายละเอียดทุกงานสำหรับเบิกจ่าย</p>
      <FeeReport />
    </main>
  );
}
