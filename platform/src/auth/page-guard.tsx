import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import type { UserRole } from '@/auth/roles';

const navigation: Array<{ href: string; label: string; roles: UserRole[] }> = [
  { href: '/pharmacy/candidates', label: 'รอยืนยันจาก HOS', roles: ['pharmacy', 'admin'] },
  { href: '/pharmacy/packages', label: 'เตรียมพัสดุ/รับยาคืน', roles: ['pharmacy', 'admin'] },
  { href: '/operations', label: 'ภาพรวมการจัดส่ง', roles: ['coordinator', 'admin', 'auditor'] },
  { href: '/operations/exceptions', label: 'งานที่ต้องตรวจสอบ', roles: ['coordinator', 'admin', 'auditor'] },
  { href: '/audit', label: 'ประวัติการตรวจสอบ', roles: ['auditor', 'admin'] },
  { href: '/admin', label: 'ผู้ดูแลระบบ', roles: ['admin'] },
  { href: '/rider/scan', label: 'รับงาน/งานของฉัน', roles: ['rider'] },
];

export async function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');

  return (
    <>
      <header>
        <nav aria-label="เมนูหลัก">
          {navigation.filter((item) => item.roles.includes(session.role)).map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}
        </nav>
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
