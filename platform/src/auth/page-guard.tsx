import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionFromCookies } from '@/auth/current-session';
import { roleHome } from '@/auth/role-home';
import type { UserRole } from '@/auth/roles';
import { MainNav, type NavGroup } from '@/auth/main-nav';
import { roleLabels } from '@/lib/labels';
import { Icon } from '@/rider/icons';

const navigation: Array<{ group: string; href: string; label: string; roles: UserRole[] }> = [
  { group: 'เภสัชกรรม', href: '/pharmacy/candidates', label: 'รอยืนยันจาก HOSxP', roles: ['pharmacy', 'admin'] },
  { group: 'เภสัชกรรม', href: '/pharmacy/packages', label: 'เตรียมพัสดุ/รับยาคืน', roles: ['pharmacy', 'admin'] },
  { group: 'การจัดส่ง', href: '/operations', label: 'ภาพรวมการจัดส่ง', roles: ['coordinator', 'admin', 'auditor'] },
  { group: 'การจัดส่ง', href: '/operations/exceptions', label: 'งานที่ต้องตรวจสอบ', roles: ['coordinator', 'admin', 'auditor'] },
  { group: 'การจัดส่ง', href: '/audit', label: 'ประวัติการตรวจสอบ', roles: ['auditor', 'admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin', label: 'บัญชีผู้ใช้', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/zones', label: 'โซนจัดส่ง', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/rates', label: 'ค่าบริการ', roles: ['admin'] },
  // Lets a rider who opens a staff page get back to the rider app.
  { group: 'ไรเดอร์', href: '/rider/scan', label: 'กลับไปหน้าไรเดอร์', roles: ['rider'] },
];

function groupsFor(role: UserRole): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of navigation.filter((entry) => entry.roles.includes(role))) {
    const group = groups.find((entry) => entry.label === item.group);
    if (group) group.items.push({ href: item.href, label: item.label });
    else groups.push({ label: item.group, items: [{ href: item.href, label: item.label }] });
  }
  return groups;
}

// The staff frame: a sidebar on desktop that folds into a top bar with scrolling tabs on a phone.
export async function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect('/login');
  const accountHref = session.role === 'rider' ? '/rider/profile' : '/account';

  return (
    <div className="staff-app">
      <header className="staff-sidebar">
        <Link href={roleHome(session.role)} className="brand">
          <span className="brand-mark" aria-hidden="true"><Icon name="package" size={20} /></span>
          <span className="brand-text"><strong>Health Rider</strong><small>โรงพยาบาลวาริชภูมิ</small></span>
        </Link>
        <MainNav groups={groupsFor(session.role)} />
        <div className="staff-user">
          <Link href={accountHref} className="user-link" aria-label={`ข้อมูลผู้ใช้ ${session.displayName}`}>
            <span className="avatar avatar-small" aria-hidden="true">{session.displayName.trim().charAt(0)}</span>
            <span className="user-text"><strong>{session.displayName}</strong><small>{roleLabels[session.role]}</small></span>
          </Link>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="icon-button" aria-label="ออกจากระบบ" title="ออกจากระบบ"><Icon name="logout" size={20} /></button>
          </form>
        </div>
      </header>
      <div className="staff-content">
        {roles.includes(session.role) ? children : (
          <main>
            <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
            <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
          </main>
        )}
      </div>
    </div>
  );
}
