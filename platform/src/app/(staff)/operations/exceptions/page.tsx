import { OperationsExceptions } from '@/app/(staff)/operations/exceptions/operations-exceptions';
import { getSessionFromCookies } from '@/auth/current-session';

export default async function OperationsExceptionsPage() {
  const session = await getSessionFromCookies();
  return (
    <main>
      <h1>งานที่ต้องตรวจสอบ</h1>
      <p>ตรวจรับยาคืนในวันเดียวกัน และพิจารณาหลักฐานออฟไลน์ที่ขัดแย้งก่อนดำเนินการต่อ</p>
      <OperationsExceptions
        canResolve={session?.role === 'coordinator' || session?.role === 'admin'}
        // Receiving medication back is pharmacy's step; admin, who also holds that role's rights, can do it from here.
        canReceiveReturn={session?.role === 'admin'}
      />
    </main>
  );
}
