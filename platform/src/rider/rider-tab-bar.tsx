'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/brand/icons';
import { useNavCounts } from '@/brand/use-nav-counts';

const tabs: Array<{ href: string; label: string; icon: IconName; matches: string[]; main?: boolean }> = [
  { href: '/rider/history', label: 'ประวัติการส่ง', icon: 'history', matches: ['/rider/history'] },
  { href: '/rider/scan', label: 'รับงาน', icon: 'scan', matches: ['/rider/scan', '/rider/attempts'], main: true },
  { href: '/rider/profile', label: 'บัญชีของฉัน', icon: 'user', matches: ['/rider/profile'] },
];

// Bottom tabs within thumb reach, with "รับงาน" as the raised button in the middle; a job page counts as part of it.
export function RiderTabBar() {
  const pathname = usePathname();
  const counts = useNavCounts();
  return (
    <nav aria-label="เมนูไรเดอร์" className="rider-tabbar">
      {tabs.map((tab) => {
        const active = tab.matches.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <Link key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined} className={tab.main ? 'tab-main' : undefined}>
            <span className="tab-icon">
              <Icon name={tab.icon} size={tab.main ? 28 : 24} />
              {counts[tab.href] ? <span className="badge" aria-label={`${counts[tab.href]} งาน`}>{counts[tab.href]}</span> : null}
            </span>
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
