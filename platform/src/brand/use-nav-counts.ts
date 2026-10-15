'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { withBasePath } from '@/lib/base-path';

const refreshMs = 60_000;

// Work counts for the menu, refreshed on each page change, every minute, and when a page reports finished work.
export function useNavCounts(): Record<string, number> {
  const pathname = usePathname();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let current = true;
    const load = () => {
      if (!navigator.onLine) return;
      void fetch(withBasePath('/api/nav-counts'), { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { counts: Record<string, number> } | null) => { if (current && body) setCounts(body.counts); })
        .catch(() => undefined);
    };
    load();
    const timer = setInterval(load, refreshMs);
    window.addEventListener('health-rider:counts', load);
    return () => {
      current = false;
      clearInterval(timer);
      window.removeEventListener('health-rider:counts', load);
    };
  }, [pathname]);

  return counts;
}
