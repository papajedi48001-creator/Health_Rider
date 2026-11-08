import { DomainError } from '@/domain/errors';

export type HealthCenterInput = { name: string; hospcode: string };

// The chosen รพ.สต. name; whether it is on the list is checked against the database by knownHealthCenter.
export function parseHealthCenter(value: unknown): string {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) throw new DomainError('ต้องเลือก รพ.สต.');
  if (name.length > 255) throw new DomainError('ชื่อ รพ.สต. ยาวเกินไป');
  return name;
}

type HealthCenterLookup = { healthCenter: { count(args: { where: { name: string } }): Promise<number> } };

export async function knownHealthCenter(store: HealthCenterLookup, name: string): Promise<string> {
  if ((await store.healthCenter.count({ where: { name } })) === 0) throw new DomainError('รพ.สต. ไม่อยู่ในรายชื่อ');
  return name;
}

// An entry on the settings page: a name and the hospcode, which several units may share.
export function parseHealthCenterInput(value: unknown): HealthCenterInput {
  const body = (value ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const hospcode = typeof body.hospcode === 'string' ? body.hospcode.trim() : '';
  if (!name) throw new DomainError('ต้องระบุชื่อ รพ.สต.');
  if (name.length > 255) throw new DomainError('ชื่อ รพ.สต. ยาวเกินไป');
  if (!/^[0-9A-Za-z]{1,20}$/.test(hospcode)) throw new DomainError('รหัสสถานบริการต้องเป็นตัวเลขหรือตัวอักษร ไม่เกิน 20 ตัว');
  return { name, hospcode };
}
