import { requireRole, type SessionUser } from '@/auth/require-role';
type Store = { find(periodId: string): Promise<{ id: string; status: string } | null>; update(value: { id: string; status: 'approved'; approvedById: string; approvedAt: Date }): Promise<unknown> };
export async function approvePayoutPeriod(periodId: string, financeUser: SessionUser | null, store: Store) {
  const finance = requireRole(financeUser, 'finance', 'admin'); const period = await store.find(periodId);
  if (!period || period.status !== 'draft') throw new Error('งวดนี้ไม่พร้อมอนุมัติ');
  return store.update({ id: period.id, status: 'approved', approvedById: finance.id, approvedAt: new Date() });
}
