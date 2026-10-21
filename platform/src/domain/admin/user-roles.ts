import type { Prisma } from '@prisma/client';
import { userRoles, type UserRole } from '@/auth/roles';
import { suggestRiderCode } from '@/domain/admin/rider-code';
import { employmentCategories, type EmploymentCategory } from '@/domain/admin/user-rules';
import { newPublicId } from '@/domain/delivery/status';
import { DomainError } from '@/domain/errors';

export type RoleSet = { roles: UserRole[]; rider?: { employmentCategory: EmploymentCategory } };

// The full set of roles an admin gives an account. At least one stays, and an admin cannot take admin away from themselves.
export function parseRoleSet(value: unknown, actorId: string, targetId: string): RoleSet {
  const body = (value ?? {}) as Record<string, unknown>;
  if (!Array.isArray(body.roles) || body.roles.some((role) => !(userRoles as readonly unknown[]).includes(role))) {
    throw new DomainError('บทบาทไม่ถูกต้อง');
  }
  const roles = userRoles.filter((role) => (body.roles as unknown[]).includes(role));
  if (roles.length === 0) throw new DomainError('ต้องมีอย่างน้อยหนึ่งบทบาท');
  if (actorId === targetId && !roles.includes('admin')) throw new DomainError('ปิดหรือลดสิทธิ์บัญชีของตัวเองไม่ได้');
  return { roles, ...riderPart(body) };
}

export type RoleRequestInput = { role: UserRole; reason: string | null };

// A user asks for a role they do not hold yet, once at a time.
export function parseRoleRequest(value: unknown, held: readonly UserRole[], pending: readonly UserRole[]): RoleRequestInput {
  const body = (value ?? {}) as Record<string, unknown>;
  if (!(userRoles as readonly unknown[]).includes(body.role)) throw new DomainError('ต้องเลือกบทบาทที่ต้องการ');
  const role = body.role as UserRole;
  if (held.includes(role)) throw new DomainError('บัญชีนี้มีบทบาทนี้อยู่แล้ว');
  if (pending.includes(role)) throw new DomainError('ส่งคำขอบทบาทนี้ไว้แล้ว รอผู้ดูแลระบบพิจารณา', 409);
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
  if (reason && reason.length > 500) throw new DomainError('เหตุผลยาวเกิน 500 ตัวอักษร');
  return { role, reason };
}

export type RoleRequestDecision = { decision: 'approve'; rider?: { employmentCategory: EmploymentCategory } } | { decision: 'reject' };

export function parseRoleRequestDecision(value: unknown): RoleRequestDecision {
  const body = (value ?? {}) as Record<string, unknown>;
  if (body.decision === 'reject') return { decision: 'reject' };
  if (body.decision !== 'approve') throw new DomainError('ต้องเลือกอนุมัติหรือไม่อนุมัติ');
  return { decision: 'approve', ...riderPart(body) };
}

function riderPart(body: Record<string, unknown>): { rider?: { employmentCategory: EmploymentCategory } } {
  if (body.employmentCategory === undefined || body.employmentCategory === '') return {};
  if (!(employmentCategories as readonly unknown[]).includes(body.employmentCategory)) throw new DomainError('ประเภทไรเดอร์ไม่ถูกต้อง');
  return { rider: { employmentCategory: body.employmentCategory as EmploymentCategory } };
}

// The role shown first stays put while the account still holds it.
export function primaryRole(current: UserRole, roles: readonly UserRole[]): UserRole {
  return roles.includes(current) ? current : roles[0];
}

type RoleClient = Pick<Prisma.TransactionClient, 'userRoleGrant' | 'riderProfile' | 'user'>;

// Makes the account hold exactly these roles. A new rider gets a rider code, which needs the rider category;
// a rider profile is kept when the role is taken away, so past deliveries still show the code.
export async function setUserRoles(tx: RoleClient, userId: string, set: RoleSet): Promise<{ before: UserRole[]; after: UserRole[]; riderCode: string | null }> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true, roleGrants: { select: { role: true } }, riderProfile: { select: { id: true } } } });
  if (!user) throw new DomainError('ไม่พบบัญชีผู้ใช้', 404);
  const before = userRoles.filter((role) => user.roleGrants.some((grant) => grant.role === role));
  let riderCode: string | null = null;
  if (set.roles.includes('rider') && !user.riderProfile) {
    if (!set.rider) throw new DomainError('ต้องเลือกประเภทไรเดอร์');
    riderCode = await suggestRiderCode(tx, set.rider.employmentCategory);
    await tx.riderProfile.create({ data: { id: newPublicId(), userId, riderCode, employmentCategory: set.rider.employmentCategory } });
  }
  const removed = before.filter((role) => !set.roles.includes(role));
  const added = set.roles.filter((role) => !before.includes(role));
  if (removed.length > 0) await tx.userRoleGrant.deleteMany({ where: { userId, role: { in: removed } } });
  if (added.length > 0) await tx.userRoleGrant.createMany({ data: added.map((role) => ({ userId, role })), skipDuplicates: true });
  const primary = primaryRole(user.role, set.roles);
  if (primary !== user.role) await tx.user.update({ where: { id: userId }, data: { role: primary } });
  return { before, after: set.roles, riderCode };
}
