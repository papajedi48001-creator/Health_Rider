export const userRoles = ['pharmacy', 'coordinator', 'rider', 'admin', 'auditor'] as const;

export type UserRole = (typeof userRoles)[number];
