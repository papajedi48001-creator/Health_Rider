import { HeroBanner } from '@/brand/hero-banner';
import { OperationsExceptions } from '@/app/(staff)/operations/exceptions/operations-exceptions';
import { getSessionFromCookies } from '@/auth/current-session';

export default async function OperationsExceptionsPage() {
  const session = await getSessionFromCookies();
  return (
    <main>
      <HeroBanner title="งานที่ต้องตรวจสอบ" text="ดูงานที่ส่งไม่สำเร็จหรือข้อมูลไม่ตรงกัน แล้วตัดสินใจทีละงาน" />
      <h1>งานที่ต้องตรวจสอบ</h1>
      <p>ตรวจรับยาคืนในวันเดียวกัน และพิจารณาหลักฐานออฟไลน์ที่ขัดแย้งก่อนดำเนินการต่อ</p>
      <OperationsExceptions
        canResolve={session?.role === 'pharmacy' || session?.role === 'coordinator' || session?.role === 'admin'}
        canReceiveReturn={session?.role === 'pharmacy' || session?.role === 'coordinator' || session?.role === 'admin'}
      />
    </main>
  );
}
