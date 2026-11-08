import { createPublicKey, verify } from 'node:crypto';

// A token key is one line the vendor sends: `HR1.<payload>.<signature>`, both parts base64url. The payload is
// the canonical JSON below and the signature is Ed25519 over those exact bytes, made with the vendor's private
// key (license-tool/hr-license.mjs). The app holds only the public key, so it can check a key offline but
// cannot make one, and a key only opens the installation whose ID it names.
export type LicensePlan = 'monthly' | 'yearly' | 'lifetime';

export type License = {
  keyId: string;
  product: 'health-rider';
  licensee: { name: string };
  installationId: string;
  plan: LicensePlan;
  issuedAt: string;
  // Last day the key may be used; null for a lifetime key.
  expiresAt: string | null;
  // Active rider accounts allowed; null is unlimited.
  maxRiders: number | null;
  // Delivery jobs per month the price covers; null is unlimited. Going over only warns.
  maxDeliveriesPerMonth: number | null;
};

// `unconfigured`: no public key compiled in, so licensing is off and the app runs as before.
export type LicenseStatus = 'unconfigured' | 'unactivated' | 'invalid' | 'active' | 'grace' | 'expired' | 'clockBack';

export type LicenseState = {
  status: LicenseStatus;
  // True shows the lock screen and refuses every API call except activation.
  locked: boolean;
  license: License | null;
  // Thai text for the banner or the lock screen; null when nothing needs saying.
  message: string | null;
  // Why the stored key was refused, when one is stored but unusable.
  problem: string | null;
};

export const graceDays = 7;
export const planLabels: Record<LicensePlan, string> = { monthly: 'รายเดือน', yearly: 'รายปี', lifetime: 'ตลอดชีพ' };
// A monthly key warns a week ahead; the others a month ahead.
export const renewalNoticeDays: Record<LicensePlan, number> = { monthly: 7, yearly: 30, lifetime: 0 };
// The server clock may drift; going back further than this looks like an attempt to stretch a key.
export const clockToleranceMs = 2 * 86_400_000;

const tokenPrefix = 'HR1';
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const installationPattern = /^HR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

// Same bytes on both sides: keys sorted at every level, no whitespace.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function addDays(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function isDate(value: unknown): value is string {
  return typeof value === 'string' && datePattern.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isLimit(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) > 0);
}

export function isInstallationId(value: string): boolean {
  return installationPattern.test(value);
}

function asLicense(value: Record<string, unknown>): License | null {
  const licensee = value.licensee as Record<string, unknown> | undefined;
  if (value.v !== 1 || value.product !== 'health-rider') return null;
  if (typeof value.keyId !== 'string' || !value.keyId) return null;
  if (!licensee || typeof licensee.name !== 'string' || !licensee.name) return null;
  if (typeof value.installationId !== 'string' || !isInstallationId(value.installationId)) return null;
  if (value.plan !== 'monthly' && value.plan !== 'yearly' && value.plan !== 'lifetime') return null;
  if (!isDate(value.issuedAt)) return null;
  if (value.plan === 'lifetime' ? value.expiresAt !== null : !isDate(value.expiresAt)) return null;
  if (!isLimit(value.maxRiders) || !isLimit(value.maxDeliveriesPerMonth)) return null;
  return {
    keyId: value.keyId,
    product: 'health-rider',
    licensee: { name: licensee.name },
    installationId: value.installationId,
    plan: value.plan,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt as string | null,
    maxRiders: value.maxRiders,
    maxDeliveriesPerMonth: value.maxDeliveriesPerMonth,
  };
}

export type ParsedLicense = { license: License; problem: null } | { license: null; problem: string };

type Expectation = { publicKeyBase64: string; installationId: string; revokedKeyIds: readonly string[] };

// Checks the signature first, then the fields, then that the key belongs to this installation and is not revoked.
export function parseTokenKey(token: string, { publicKeyBase64, installationId, revokedKeyIds }: Expectation): ParsedLicense {
  const parts = token.replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== tokenPrefix || !parts[1] || !parts[2]) return { license: null, problem: 'รูปแบบ token key ไม่ถูกต้อง โปรดคัดลอก key ที่ได้รับมาทั้งบรรทัด' };
  const payload = Buffer.from(parts[1], 'base64url');

  let valid = false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    valid = verify(null, payload, key, Buffer.from(parts[2], 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) return { license: null, problem: 'token key ไม่ถูกต้อง ถูกแก้ไข หรือไม่ได้ออกโดยผู้พัฒนา' };

  let value: unknown;
  try {
    value = JSON.parse(payload.toString('utf8'));
  } catch {
    value = null;
  }
  const license = value && typeof value === 'object' && !Array.isArray(value) ? asLicense(value as Record<string, unknown>) : null;
  if (!license) return { license: null, problem: 'ข้อมูลใน token key ไม่ครบหรือไม่ถูกต้อง' };
  if (license.installationId !== installationId) return { license: null, problem: `token key นี้ออกให้เครื่องรหัส ${license.installationId} ไม่ใช่เครื่องนี้ (${installationId})` };
  if (revokedKeyIds.includes(license.keyId)) return { license: null, problem: `token key ${license.keyId} ถูกยกเลิกแล้ว โปรดติดต่อผู้พัฒนา` };
  return { license, problem: null };
}

type Inputs = {
  publicKeyConfigured: boolean;
  parsed: ParsedLicense | null;
  // Bangkok date as YYYY-MM-DD.
  today: string;
  // True when the server clock is well behind a time this install has already seen.
  clockBack: boolean;
};

export function thaiDate(date: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

// What the app may do today. Anything short of a usable key locks the app; the data stays and a new key opens it again.
export function evaluateLicense({ publicKeyConfigured, parsed, today, clockBack }: Inputs): LicenseState {
  if (!publicKeyConfigured) return { status: 'unconfigured', locked: false, license: null, message: null, problem: null };
  if (!parsed) return { status: 'unactivated', locked: true, license: null, problem: null, message: 'ระบบยังไม่ได้เปิดใช้งาน โปรดใส่ token key ที่ได้รับจากผู้พัฒนา' };
  if (!parsed.license) return { status: 'invalid', locked: true, license: null, problem: parsed.problem, message: `ใช้ token key ที่บันทึกไว้ไม่ได้: ${parsed.problem}` };

  const license = parsed.license;
  if (clockBack) {
    return { status: 'clockBack', locked: true, license, problem: null, message: 'เวลาของเครื่องเซิร์ฟเวอร์ถูกตั้งย้อนหลัง โปรดตั้งเวลาให้ถูกต้องแล้วเปิดหน้านี้ใหม่' };
  }
  if (!license.expiresAt) return { status: 'active', locked: false, license, problem: null, message: null };

  if (today > license.expiresAt) {
    const graceEnds = addDays(license.expiresAt, graceDays);
    if (today <= graceEnds) {
      return { status: 'grace', locked: false, license, problem: null, message: `License หมดอายุแล้วเมื่อ${thaiDate(license.expiresAt)} ใช้งานต่อได้ถึง${thaiDate(graceEnds)} หลังจากนั้นระบบจะล็อก โปรดต่ออายุ` };
    }
    return { status: 'expired', locked: true, license, problem: null, message: `License หมดอายุเมื่อ${thaiDate(license.expiresAt)} โปรดใส่ token key ใหม่เพื่อใช้งานต่อ ข้อมูลทั้งหมดยังอยู่ครบ` };
  }
  const left = daysBetween(today, license.expiresAt);
  return {
    status: 'active', locked: false, license, problem: null,
    message: left <= renewalNoticeDays[license.plan] ? `License จะหมดอายุ${thaiDate(license.expiresAt)} (อีก ${left} วัน) โปรดต่ออายุล่วงหน้า` : null,
  };
}

// The last day a key can be used, for comparing a renewal with the key it replaces; lifetime never ends.
export function lastUsableDay(license: License): string {
  return license.expiresAt ?? '9999-12-31';
}

// API calls a locked app still answers: its version (the host updater checks it), the lock screen's own calls,
// signing out, and rider work already done on the road, so a delivery made before the lock is never lost.
const openWhileLocked = [
  /^\/api\/version$/,
  /^\/api\/license(\/.*)?$/,
  /^\/api\/auth\/logout$/,
  /^\/api\/rider\/sync-events$/,
  /^\/api\/rider\/attempts\/[^/]+\/evidence$/,
];

export function openWhileLockedPath(pathname: string): boolean {
  return openWhileLocked.some((pattern) => pattern.test(pathname));
}
