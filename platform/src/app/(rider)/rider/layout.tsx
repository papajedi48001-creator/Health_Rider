import type { ReactNode } from 'react';
import { RoleGate } from '@/auth/page-guard';
import { RegisterServiceWorker } from '@/pwa/register-service-worker';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RoleGate roles={['rider']}>
      <RegisterServiceWorker />
      {children}
    </RoleGate>
  );
}
