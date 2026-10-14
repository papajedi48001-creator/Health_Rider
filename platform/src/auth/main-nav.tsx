'use client';

import { usePathname } from 'next/navigation';

// Top tabs: the item whose path is the longest prefix of the current page is the active tab.
export function MainNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav aria-label="เมนูหลัก" className="tabs">
      {items.map((item) => (
        <a key={item.href} href={item.href} aria-current={item.href === active ? 'page' : undefined}>{item.label}</a>
      ))}
    </nav>
  );
}
