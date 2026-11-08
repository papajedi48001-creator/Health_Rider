import type { UserRole } from '@/auth/roles';

// An admin can switch the menu to what a coordinator, pharmacist or rider sees. Only the menu changes: the admin
// keeps every permission, and the choice is ignored for anyone who is not an admin.
export const viewCookieName = 'hr_view';
export const adminViews = ['admin', 'coordinator', 'pharmacy', 'rider'] as const;
export type AdminView = (typeof adminViews)[number];

export const viewLabels: Record<AdminView, string> = {
  admin: 'ผู้ดูแลระบบ',
  coordinator: 'ผู้ประสานงาน',
  pharmacy: 'เภสัชกร',
  rider: 'ไรเดอร์',
};

export function isAdminView(value: unknown): value is AdminView {
  return typeof value === 'string' && (adminViews as readonly string[]).includes(value);
}

// The role whose menu is shown.
export function menuRole(role: UserRole, view: string | undefined): UserRole {
  return role === 'admin' && isAdminView(view) ? view : role;
}
