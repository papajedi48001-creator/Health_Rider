import type { ReactNode } from 'react';
import { RiderShell } from '@/rider/rider-shell';
import { RegisterServiceWorker } from '@/pwa/register-service-worker';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RiderShell>
      <RegisterServiceWorker />
      {children}
    </RiderShell>
  );
}
