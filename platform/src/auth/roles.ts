export const userRoles = ['pharmacy', 'coordinator', 'rider', 'finance', 'admin', 'auditor'] as const;

export type UserRole = (typeof userRoles)[number];
