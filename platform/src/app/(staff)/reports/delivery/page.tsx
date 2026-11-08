import { HeroBanner } from '@/brand/hero-banner';
import { DeliveryReport } from '@/app/(staff)/reports/delivery/delivery-report';

export default function DeliveryReportPage() {
  return (
    <main>
      <HeroBanner title="รายงานการจัดส่ง" text="สรุปผลการจัดส่งตามโซน ไรเดอร์ และช่วงวันที่" />
      <h1>รายงานการจัดส่ง</h1>
      <p>ผลงานของไรเดอร์แต่ละคน ผลการส่งแยกตามโซน และเวลาที่ใช้ส่งหลังรับยา</p>
      <DeliveryReport />
    </main>
  );
}
