'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { withBasePath } from '@/lib/base-path';

export function RegisterServiceWorker() {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register(withBasePath('/sw.js'), { scope: withBasePath('/') }).catch(() => undefined);
  }, []);

  // Asks the service worker to store this page so it opens without signal later, including pages
  // reached by in-app navigation, which the service worker does not see as a page load.
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.onLine) return;
    void navigator.serviceWorker.ready.then((registration) => registration.active?.postMessage({ cachePage: withBasePath(pathname) })).catch(() => undefined);
  }, [pathname]);

  return null;
}
