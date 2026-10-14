import { AdminUsers } from '@/app/(staff)/admin/admin-users';
import { AdminZones } from '@/app/(staff)/admin/admin-zones';

export default function AdminPage() {
  return (
    <main>
      <h1>ผู้ดูแลระบบ</h1>
      <p>จัดการบัญชีผู้ใช้ ไรเดอร์ และโซนจัดส่ง ทุกการเปลี่ยนแปลงถูกบันทึกในประวัติการตรวจสอบ</p>
      <AdminUsers />
      <AdminZones />
    </main>
  );
}
