import { AdminUsers } from '@/app/(staff)/admin/admin-users';

export default function AdminPage() {
  return (
    <main>
      <h1>บัญชีผู้ใช้</h1>
      <p>จัดการบัญชีผู้ใช้และไรเดอร์ ทุกการเปลี่ยนแปลงถูกบันทึกในประวัติการตรวจสอบ</p>
      <AdminUsers />
    </main>
  );
}
