import Link from 'next/link';
import { OperationsDashboard } from '@/app/(staff)/operations/operations-dashboard';

export default function OperationsPage() {
  return (
    <main>
      <h1>ภาพรวมการจัดส่ง</h1>
      <p>ติดตามงานตามวัน โซน ไรเดอร์ และสถานะการจัดส่ง · <Link href="/operations/exceptions">งานที่ต้องตรวจสอบ</Link></p>
      <OperationsDashboard />
    </main>
  );
}
