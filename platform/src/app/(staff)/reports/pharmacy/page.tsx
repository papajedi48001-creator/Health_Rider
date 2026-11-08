import { HeroBanner } from '@/brand/hero-banner';
import { PharmacyReport } from '@/app/(staff)/reports/pharmacy/pharmacy-report';

export default function PharmacyReportPage() {
  return (
    <main>
      <HeroBanner title="รายงานเภสัชกรรม" text="สรุปงานเตรียมยาและพัสดุตามช่วงวันที่" />
      <h1>รายงานเภสัชกรรม</h1>
      <p>ยอดผู้ป่วยที่ยืนยันจาก HOSxP ผลการส่งยา และยาที่รับคืน แยกตามวันและตำบล</p>
      <PharmacyReport />
    </main>
  );
}
