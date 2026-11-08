import type { UserRole } from '@/auth/roles';

export type UserFilters = { healthCenter: string; role: string; q: string };

type FilterableUser = { username: string; displayName: string; healthCenter: string | null; phone?: string | null; roles: readonly UserRole[]; riderProfile?: { riderCode: string } | null };

export const noHealthCenterFilter = '__none__';

// The admin's user list narrowed by รพ.สต., role and a name, username, phone or rider code search.
export function filterUsers<T extends FilterableUser>(users: readonly T[], filters: UserFilters): T[] {
  const q = filters.q.trim().toLowerCase();
  return users.filter((user) => {
    if (filters.healthCenter === noHealthCenterFilter ? user.healthCenter : filters.healthCenter && user.healthCenter !== filters.healthCenter) return false;
    if (filters.role && !user.roles.includes(filters.role as UserRole)) return false;
    if (!q) return true;
    return [user.displayName, user.username, user.phone ?? '', user.riderProfile?.riderCode ?? ''].some((text) => text.toLowerCase().includes(q));
  });
}

export function readUserFilters(params: URLSearchParams): UserFilters {
  return { healthCenter: params.get('healthCenter') ?? '', role: params.get('role') ?? '', q: params.get('q') ?? '' };
}
