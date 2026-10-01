import { requireRole, type SessionUser } from '@/auth/require-role';
type Store = { find(periodId: string): Promise<{ id: string; status: string } | null>; update(value: { id: string; status: 'closed'; closedAt: Date }): Promise<unknown> };
export async function closePayoutPeriod(periodId: string, financeUser: SessionUser | null, store: Store) {
  requireRole(financeUser, 'finance', 'admin'); const period = await store.find(periodId);
  if (!period || period.status !== 'approved') throw new Error('งวดนี้ไม่พร้อมปิด');
  return store.update({ id: period.id, status: 'closed', closedAt: new Date() });
}
