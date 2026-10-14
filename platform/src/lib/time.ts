// Thailand has a fixed UTC+7 offset with no daylight saving time.
const bangkokOffsetMs = 7 * 60 * 60 * 1000;

export function bangkokDateString(date: Date): string {
  return new Date(date.getTime() + bangkokOffsetMs).toISOString().slice(0, 10);
}

export function isSameBangkokDay(left: Date, right: Date): boolean {
  return bangkokDateString(left) === bangkokDateString(right);
}

export function startOfBangkokDay(dateString: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const date = new Date(`${dateString}T00:00:00.000+07:00`);
  return Number.isNaN(date.getTime()) || bangkokDateString(date) !== dateString ? null : date;
}
