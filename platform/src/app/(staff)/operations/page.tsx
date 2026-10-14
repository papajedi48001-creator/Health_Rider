import { HeroBanner } from '@/brand/hero-banner';
import Link from 'next/link';
import { OperationsDashboard } from '@/app/(staff)/operations/operations-dashboard';

export default function OperationsPage() {
  return (
    <main>
      <HeroBanner title="ภาพรวมวันนี้" text="ติดตามทุกงานส่งยาตั้งแต่เตรียมพัสดุจนถึงมือผู้รับ" />
      <h1>ภาพรวมการจัดส่ง</h1>
      <p>ติดตามงานตามวัน โซน ไรเดอร์ และสถานะการจัดส่ง · <Link href="/operations/exceptions">งานที่ต้องตรวจสอบ</Link></p>
      <OperationsDashboard />
    </main>
  );
}
