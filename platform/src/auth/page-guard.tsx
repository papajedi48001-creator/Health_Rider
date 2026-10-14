import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import type { UserRole } from '@/auth/roles';
import { MainNav } from '@/auth/main-nav';

const navigation: Array<{ href: string; label: string; roles: UserRole[] }> = [
  { href: '/pharmacy/candidates', label: 'รอยืนยันจาก HOSxP', roles: ['pharmacy', 'admin'] },
  { href: '/pharmacy/packages', label: 'เตรียมพัสดุ/รับยาคืน', roles: ['pharmacy', 'admin'] },
  { href: '/operations', label: 'ภาพรวมการจัดส่ง', roles: ['coordinator', 'admin', 'auditor'] },
  { href: '/operations/exceptions', label: 'งานที่ต้องตรวจสอบ', roles: ['coordinator', 'admin', 'auditor'] },
  { href: '/audit', label: 'ประวัติการตรวจสอบ', roles: ['auditor', 'admin'] },
  { href: '/admin', label: 'บัญชีผู้ใช้', roles: ['admin'] },
  { href: '/admin/zones', label: 'โซนจัดส่ง', roles: ['admin'] },
  { href: '/admin/rates', label: 'ค่าบริการ', roles: ['admin'] },
  { href: '/rider/scan', label: 'รับงาน/งานของฉัน', roles: ['rider'] },
  { href: '/rider/history', label: 'ประวัติการส่ง', roles: ['rider'] },
];

export async function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');

  return (
    <>
      <header>
        <MainNav items={navigation.filter((item) => item.roles.includes(session.role)).map(({ href, label }) => ({ href, label }))} />
        <span>{session.displayName}</span>
        <form action="/api/auth/logout" method="post">
          <button type="submit">ออกจากระบบ</button>
        </form>
      </header>
      {roles.includes(session.role) ? children : (
        <main>
          <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
          <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
        </main>
      )}
    </>
  );
}
