import type { ReactNode } from 'react';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSessionFromCookies, loginRedirectPath } from '@/auth/current-session';
import { roleHome } from '@/auth/role-home';
import type { UserRole } from '@/auth/roles';
import { MainNav, type NavGroup } from '@/auth/main-nav';
import { isAdminView, menuRole, viewCookieName } from '@/auth/view-as';
import { ViewSwitcher } from '@/auth/view-switcher';
import { roleLabels } from '@/lib/labels';
import { Brand } from '@/brand/logo';
import { Icon, type IconName } from '@/brand/icons';
import { Mascot, mascotName } from '@/brand/mascot';
import { withBasePath } from '@/lib/base-path';
import { UserAvatar } from '@/account/user-avatar';

const navigation: Array<{ group: string; href: string; label: string; icon: IconName; roles: UserRole[] }> = [
  { group: 'เภสัชกรรม', href: '/pharmacy/candidates', label: 'รอยืนยันจาก HOSxP', icon: 'clipboard', roles: ['pharmacy', 'admin'] },
  { group: 'เภสัชกรรม', href: '/pharmacy/packages', label: 'เตรียมพัสดุ', icon: 'package', roles: ['pharmacy', 'admin'] },
  { group: 'เภสัชกรรม', href: '/pharmacy/awaiting-rider', label: 'รอไรเดอร์รับงาน', icon: 'scooter', roles: ['pharmacy', 'admin'] },
  { group: 'เภสัชกรรม', href: '/pharmacy/returns', label: 'รอรับยาคืน', icon: 'undo', roles: ['pharmacy', 'admin'] },
  { group: 'การจัดส่ง', href: '/operations', label: 'ภาพรวมการจัดส่ง', icon: 'dashboard', roles: ['coordinator', 'admin'] },
  { group: 'การจัดส่ง', href: '/operations/exceptions', label: 'งานที่ต้องตรวจสอบ', icon: 'alert', roles: ['coordinator', 'admin'] },
  { group: 'การจัดส่ง', href: '/audit', label: 'ประวัติการตรวจสอบ', icon: 'shield', roles: ['auditor', 'admin'] },
  { group: 'รายงาน', href: '/reports/pharmacy', label: 'รายงานเภสัชกรรม', icon: 'chart', roles: ['pharmacy', 'admin'] },
  { group: 'รายงาน', href: '/reports/delivery', label: 'รายงานการจัดส่ง', icon: 'chart', roles: ['coordinator', 'admin'] },
  { group: 'รายงาน', href: '/reports/history', label: 'ค้นหาประวัติการส่ง', icon: 'history', roles: ['coordinator', 'admin'] },
  { group: 'รายงาน', href: '/reports/fees', label: 'ค่าบริการไรเดอร์', icon: 'coins', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin', label: 'บัญชีผู้ใช้', icon: 'users', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/zones', label: 'โซนจัดส่ง', icon: 'map', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/rates', label: 'ค่าบริการ', icon: 'coins', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/labels', label: 'ตั้งค่าฉลาก QR', icon: 'package', roles: ['admin'] },
  { group: 'ผู้ดูแลระบบ', href: '/admin/settings', label: 'ตั้งค่าระบบ', icon: 'settings', roles: ['admin'] },
  // Lets a rider who opens a staff page get back to the rider app.
  { group: 'ไรเดอร์', href: '/rider/scan', label: 'กลับไปหน้าไรเดอร์', icon: 'scan', roles: ['rider'] },
];

function groupsFor(role: UserRole): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of navigation.filter((entry) => entry.roles.includes(role))) {
    const group = groups.find((entry) => entry.label === item.group);
    const entry = { href: item.href, label: item.label, icon: item.icon };
    if (group) group.items.push(entry);
    else groups.push({ label: item.group, items: [entry] });
  }
  return groups;
}

// The staff frame: a sidebar on desktop that folds into a top bar with scrolling tabs on a phone.
export async function RoleGate({ roles, children }: { roles: readonly UserRole[]; children: ReactNode }) {
  const session = await getSessionFromCookies();
  if (!session) redirect(await loginRedirectPath());
  const accountHref = session.role === 'rider' ? '/rider/profile' : '/account';
  const view = (await cookies()).get(viewCookieName)?.value;
  const shownRole = menuRole(session.role, view);

  return (
    <div className="staff-app">
      <header className="staff-sidebar">
        <Link href={roleHome(shownRole)} className="brand">
          <Brand />
        </Link>
        {session.role === 'admin' && <ViewSwitcher view={isAdminView(view) ? view : 'admin'} />}
        <MainNav groups={groupsFor(shownRole)} />
        <div className="sidebar-mascot" aria-hidden="true">
          <Mascot width={120} variant="small" />
          <span>{mascotName} พร้อมส่งยาถึงบ้าน</span>
        </div>
        <div className="staff-user">
          <Link href={accountHref} className="user-link" aria-label={`ข้อมูลผู้ใช้ ${session.displayName}`}>
            <UserAvatar userId={session.id} name={session.displayName} version={session.avatarVersion} small />
            <span className="user-text"><strong>{session.displayName}</strong><small>{roleLabels[session.role]}</small></span>
          </Link>
          <form action={withBasePath('/api/auth/logout')} method="post">
            <button type="submit" className="icon-button" aria-label="ออกจากระบบ" title="ออกจากระบบ"><Icon name="logout" size={20} /></button>
          </form>
        </div>
      </header>
      <div className="staff-content">
        {roles.includes(session.role) ? children : (
          <main className="no-access">
            <Mascot width={180} variant="small" />
            <h1>ไม่มีสิทธิ์เข้าหน้านี้</h1>
            <p>บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้ โปรดติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่ม</p>
          </main>
        )}
      </div>
    </div>
  );
}
