import type { UserRole } from '@/auth/roles';

const roleHomes: Record<UserRole, string> = {
  pharmacy: '/pharmacy/candidates',
  coordinator: '/operations',
  rider: '/rider/scan',
  admin: '/operations',
  auditor: '/audit',
};

export function roleHome(role: UserRole): string {
  return roleHomes[role];
}

// Only same-site relative paths are accepted so a login link cannot redirect elsewhere.
export function safeNextPath(next: string | null | undefined): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}
