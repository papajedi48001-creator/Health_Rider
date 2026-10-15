import { DeliveryReport } from '@/app/(staff)/reports/delivery/delivery-report';

export default function DeliveryReportPage() {
  return (
    <main>
      <h1>รายงานการจัดส่ง</h1>
      <p>ผลงานของไรเดอร์แต่ละคน ผลการส่งแยกตามโซน และเวลาที่ใช้ส่งหลังรับยา</p>
      <DeliveryReport />
    </main>
  );
}
