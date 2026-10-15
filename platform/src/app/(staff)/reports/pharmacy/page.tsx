import { PharmacyReport } from '@/app/(staff)/reports/pharmacy/pharmacy-report';

export default function PharmacyReportPage() {
  return (
    <main>
      <h1>รายงานเภสัชกรรม</h1>
      <p>ยอดผู้ป่วยที่ยืนยันจาก HOSxP ผลการส่งยา และยาที่รับคืน แยกตามวันและตำบล</p>
      <PharmacyReport />
    </main>
  );
}
