'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavGroup = { label: string; items: { href: string; label: string }[] };

// The item whose path is the longest prefix of the current page is the active one.
export function MainNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();
  const active = groups.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav aria-label="เมนูหลัก" className="tabs">
      {groups.map((group) => (
        <div key={group.label} className="nav-group">
          <span className="nav-group-label">{group.label}</span>
          {group.items.map((item) => (
            <Link key={item.href} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</Link>
          ))}
        </div>
      ))}
    </nav>
  );
}
