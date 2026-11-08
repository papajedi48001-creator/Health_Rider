import type { ReactNode } from 'react';
import { RoleGate } from '@/auth/page-guard';
import { userRoles } from '@/auth/roles';

export const dynamic = 'force-dynamic';

export default function Layout({ children }: { children: ReactNode }) {
  return <RoleGate roles={userRoles}>{children}</RoleGate>;
}
