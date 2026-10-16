import { DomainError } from '@/domain/errors';
import { getAuthSecret } from '@/lib/env';
import { openSecret, sealSecret } from '@/lib/secret-box';

type Environment = Record<string, string | undefined>;

export const hosSettingKey = 'hos';

export type HosConnection = { host: string; port: number; user: string; password: string; database: string };

// Where the HOSxP settings in effect came from: the settings page, the .env file, or nowhere yet.
export type HosConfig = {
  source: 'system' | 'env' | 'none';
  connection: HosConnection | null;
  eligibleItemCodes: string[];
  // Set when a stored password can no longer be read, e.g. after AUTH_SECRET changed.
  problem: string | null;
};

// What the settings page stores; the password is sealed with AUTH_SECRET.
export type StoredHosSettings = {
  host: string;
  port: number;
  user: string;
  database: string;
  password: string;
  eligibleItemCodes: string[];
};

type SettingStore = { findUnique(args: { where: { key: string } }): Promise<{ value: unknown } | null> };

// Thrown when HOSxP cannot be read; routes answer it with 503 and the Thai reason.
export class HosUnavailableError extends DomainError {
  constructor(message: string) {
    super(message, 503);
  }
}

export function parseItemCodes(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((code) => code.trim()).filter(Boolean))];
}

export function connectionFromUrl(value: string): HosConnection {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HosUnavailableError('HOS_DATABASE_URL ในไฟล์ .env ไม่ใช่ URL ที่ถูกต้อง');
  }
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') throw new HosUnavailableError('HOS_DATABASE_URL ต้องขึ้นต้นด้วย mysql://');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

export function isStoredHosSettings(value: unknown): value is StoredHosSettings {
  const record = value as Record<string, unknown> | null;
  return typeof record?.host === 'string' && typeof record.port === 'number' && typeof record.user === 'string'
    && typeof record.database === 'string' && typeof record.password === 'string' && Array.isArray(record.eligibleItemCodes);
}

// Settings saved on the settings page win; otherwise HOS_DATABASE_URL and HOS_ELIGIBLE_ITEM_CODES from .env apply.
export async function loadHosConfig(environment: Environment, store: SettingStore): Promise<HosConfig> {
  const stored = (await store.findUnique({ where: { key: hosSettingKey } }))?.value;
  if (isStoredHosSettings(stored)) {
    const password = stored.password ? openSecret(stored.password, getAuthSecret(environment)) : '';
    const { host, port, user, database, eligibleItemCodes } = stored;
    return {
      source: 'system',
      connection: password === null ? null : { host, port, user, database, password },
      eligibleItemCodes,
      problem: password === null ? 'อ่านรหัสผ่าน HOSxP ที่บันทึกไว้ไม่ได้ (AUTH_SECRET อาจถูกเปลี่ยน) โปรดกรอกรหัสผ่านใหม่ที่เมนูตั้งค่าระบบ' : null,
    };
  }

  const url = environment.HOS_DATABASE_URL?.trim();
  const eligibleItemCodes = parseItemCodes(environment.HOS_ELIGIBLE_ITEM_CODES ?? '');
  if (!url) return { source: eligibleItemCodes.length > 0 ? 'env' : 'none', connection: null, eligibleItemCodes, problem: null };
  return { source: 'env', connection: connectionFromUrl(url), eligibleItemCodes, problem: null };
}

// The settings the page may show: everything but the password itself.
export function publicHosSettings(config: HosConfig) {
  return {
    source: config.source,
    host: config.connection?.host ?? '',
    port: config.connection?.port ?? 3306,
    user: config.connection?.user ?? '',
    database: config.connection?.database ?? '',
    hasPassword: Boolean(config.connection?.password),
    eligibleItemCodes: config.eligibleItemCodes,
    problem: config.problem,
  };
}

/** Validates the settings form. A blank password keeps the one in effect now. */
export function parseHosSettingsInput(value: unknown, current: HosConfig): HosConnection & { eligibleItemCodes: string[] } {
  const body = (value ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof body[key] === 'string' ? (body[key] as string).trim() : '');
  const host = text('host');
  const user = text('user');
  const database = text('database');
  const port = Number(text('port') || body.port || 3306);
  const typedPassword = typeof body.password === 'string' ? body.password : '';
  const codes = Array.isArray(body.eligibleItemCodes) ? body.eligibleItemCodes.join(',') : text('eligibleItemCodes');
  const eligibleItemCodes = parseItemCodes(codes);

  if (!/^[A-Za-z0-9.-]{1,255}$/.test(host)) throw new DomainError('ต้องระบุ host ของ HOSxP เป็นชื่อเครื่องหรือ IP เช่น 192.168.1.254');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new DomainError('port ต้องเป็นตัวเลข 1-65535');
  if (!user || user.length > 80) throw new DomainError('ต้องระบุชื่อผู้ใช้ HOSxP');
  if (!/^[A-Za-z0-9_$-]{1,64}$/.test(database)) throw new DomainError('ชื่อฐานข้อมูล HOSxP ใช้ได้เฉพาะ a-z, 0-9, _ และ -');
  if (typedPassword.length > 200) throw new DomainError('รหัสผ่านยาวเกินไป');
  if (eligibleItemCodes.length > 500 || eligibleItemCodes.some((code) => !/^[A-Za-z0-9_-]{1,32}$/.test(code))) {
    throw new DomainError('รหัสยา (icode) ใช้ได้เฉพาะตัวอักษรและตัวเลข คั่นด้วยจุลภาคหรือขึ้นบรรทัดใหม่');
  }
  const password = typedPassword || current.connection?.password || '';
  if (!password) throw new DomainError('ต้องระบุรหัสผ่าน HOSxP');
  return { host, port, user, database, password, eligibleItemCodes };
}

export function sealHosSettings(input: HosConnection & { eligibleItemCodes: string[] }, environment: Environment): StoredHosSettings {
  return { ...input, password: sealSecret(input.password, getAuthSecret(environment)) };
}
