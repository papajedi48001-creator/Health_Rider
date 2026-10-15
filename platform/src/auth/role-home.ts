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

const placeholderOrigin = 'http://health-rider.invalid';

// Only same-site relative paths are accepted so a login link cannot redirect elsewhere. Browsers drop
// tabs and newlines and read "\" as "/", so "/\t/evil.example" would otherwise leave the site.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(next)) return null;
  try {
    const url = new URL(next, placeholderOrigin);
    return url.origin === placeholderOrigin ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}
