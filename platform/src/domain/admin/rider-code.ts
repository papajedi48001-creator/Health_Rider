import type { EmploymentCategory } from '@/domain/admin/user-rules';

// Hospital staff riders get INT-001, INT-002, …; outside contractors get EXT-001, EXT-002, …
const prefixes: Record<EmploymentCategory, string> = { internal: 'INT', external: 'EXT' };

export function nextRiderCode(category: EmploymentCategory, existingCodes: readonly string[]): string {
  const prefix = prefixes[category];
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = existingCodes.reduce((max, code) => {
    const match = pattern.exec(code);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${String(highest + 1).padStart(3, '0')}`;
}

type RiderCodeStore = {
  riderProfile: {
    findMany(args: { where: { riderCode: { startsWith: string } }; select: { riderCode: true } }): Promise<Array<{ riderCode: string }>>;
  };
};

export async function suggestRiderCode(store: RiderCodeStore, category: EmploymentCategory): Promise<string> {
  const rows = await store.riderProfile.findMany({ where: { riderCode: { startsWith: `${prefixes[category]}-` } }, select: { riderCode: true } });
  return nextRiderCode(category, rows.map((row) => row.riderCode));
}
