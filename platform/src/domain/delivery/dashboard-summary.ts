import type { DeliveryAttemptStatus } from '@/domain/delivery/status';

// The home page's tabs: each groups the statuses a person would look for together.
export const dashboardTabs = [
  { key: 'all', label: 'ทั้งหมด', statuses: null },
  { key: 'waiting', label: 'รอไรเดอร์รับงาน', statuses: ['prepared'] },
  { key: 'moving', label: 'กำลังจัดส่ง', statuses: ['claimed', 'in_transit'] },
  { key: 'delivered', label: 'ส่งสำเร็จ', statuses: ['delivered'] },
  { key: 'attention', label: 'ต้องติดตาม', statuses: ['delivery_failed', 'return_required', 'sync_review'] },
] as const satisfies ReadonlyArray<{ key: string; label: string; statuses: readonly DeliveryAttemptStatus[] | null }>;

export type DashboardTabKey = (typeof dashboardTabs)[number]['key'];

export function dashboardTab(key: string | undefined) {
  return dashboardTabs.find((tab) => tab.key === key) ?? dashboardTabs[0];
}

export function inTab(status: DeliveryAttemptStatus, key: DashboardTabKey): boolean {
  const statuses = dashboardTab(key).statuses as readonly DeliveryAttemptStatus[] | null;
  return statuses === null || statuses.includes(status);
}

type SummaryAttempt = { status: DeliveryAttemptStatus; deliveredAt: Date | null; rateSatang: number | null };

// Counts for the stat cards, worked out from today's list: delivered and fees count only what was delivered today.
export function summarize(attempts: SummaryAttempt[], dayStart: Date) {
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const deliveredToday = attempts.filter((attempt) => attempt.status === 'delivered' && attempt.deliveredAt && attempt.deliveredAt >= dayStart && attempt.deliveredAt < dayEnd);
  return {
    total: attempts.length,
    tabs: Object.fromEntries(dashboardTabs.map((tab) => [tab.key, attempts.filter((attempt) => inTab(attempt.status, tab.key)).length])) as Record<DashboardTabKey, number>,
    deliveredToday: deliveredToday.length,
    feesSatang: deliveredToday.reduce((sum, attempt) => sum + (attempt.rateSatang ?? 0), 0),
  };
}
