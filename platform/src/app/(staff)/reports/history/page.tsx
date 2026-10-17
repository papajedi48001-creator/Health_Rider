import { DeliveryHistorySearch } from '@/app/(staff)/reports/history/history-search';

export default function DeliveryHistoryPage() {
  return (
    <main>
      <h1>ค้นหาประวัติการส่ง</h1>
      <p>ค้นหางานส่งยาด้วย HN หรือชื่อผู้ป่วย รหัสหรือชื่อไรเดอร์ ตำบล หรือโซนหมู่บ้าน กดปุ่ม i เพื่อดูรายละเอียด</p>
      <DeliveryHistorySearch />
    </main>
  );
}
