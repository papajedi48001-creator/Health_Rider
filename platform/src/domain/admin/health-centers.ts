import { DomainError } from '@/domain/errors';

// The care units (hosp_sname in HOSxP) that split the area of responsibility; every account belongs to one.
export const healthCenters = [
  'PCU รพ.วาริชภูมิ',
  'รพ.วาริชภูมิ',
  'รพ.สต.คำบิด',
  'รพ.สต.จำปาทอง',
  'รพ.สต.ดงคำโพธิ์',
  'รพ.สต.ดอนยาวใหญ่',
  'รพ.สต.ดอนส้มโฮง',
  'รพ.สต.ตาดโพนไผ่',
  'รพ.สต.ปลาโหล',
  'รพ.สต.ภูวงน้อย',
  'รพ.สต.หนองท่ม',
] as const;
export type HealthCenter = (typeof healthCenters)[number];

export function parseHealthCenter(value: unknown): HealthCenter {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new DomainError('ต้องเลือก รพ.สต.');
  if (!(healthCenters as readonly string[]).includes(name)) throw new DomainError('รพ.สต. ไม่อยู่ในรายชื่อ');
  return name as HealthCenter;
}
