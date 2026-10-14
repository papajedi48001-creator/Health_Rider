'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/brand/icons';
import { useNavCounts } from '@/brand/use-nav-counts';

export type NavGroup = { label: string; items: { href: string; label: string; icon: IconName }[] };

// The item whose path is the longest prefix of the current page is the active one; work counts follow the labels.
export function MainNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const counts = useNavCounts();
  const active = groups.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav aria-label="เมนูหลัก" className="tabs">
      {groups.map((group) => (
        <div key={group.label} className="nav-group">
          <span className="nav-group-label">{group.label}</span>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === active ? 'page' : undefined}>
              <Icon name={item.icon} size={19} />
              <span className="nav-label">{item.label}</span>
              {counts[item.href] !== undefined && (
                <span className={`badge${counts[item.href] === 0 ? ' badge-zero' : ''}`} aria-label={`${counts[item.href]} งาน`}>{counts[item.href]}</span>
              )}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
