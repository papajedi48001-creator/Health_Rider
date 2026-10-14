'use client';

import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/rider/scan', label: 'งานของฉัน', match: ['/rider/scan', '/rider/attempts'], icon: 'jobs' },
  { href: '/rider/history', label: 'ประวัติการส่ง', match: ['/rider/history'], icon: 'history' },
] as const;

// Bottom tab bar for the rider app; the job page counts as part of "งานของฉัน".
export function RiderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="เมนูไรเดอร์" className="rider-tabs">
      {tabs.map((tab) => {
        const active = tab.match.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        return (
          <a key={tab.href} href={tab.href} aria-current={active ? 'page' : undefined}>
            {tab.icon === 'jobs' ? <JobsIcon /> : <HistoryIcon />}
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function JobsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 3" />
    </svg>
  );
}
