import type { ReactNode } from 'react';
import { RoleGate } from '@/auth/page-guard';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleGate roles={['coordinator', 'admin', 'auditor']}>{children}</RoleGate>;
}
