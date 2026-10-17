import { createPublicKey, verify } from 'node:crypto';

// A license file is the JSON below plus an Ed25519 `signature` over its canonical form, made with the
// vendor's private key (license-tool/hr-license.mjs). The app only holds the public key, so it can check a
// file offline but cannot make one.
export type LicenseType = 'perpetual' | 'subscription';

export type License = {
  licenseId: string;
  product: 'health-rider';
  licensee: { name: string; hcode: string; province: string };
  type: LicenseType;
  issuedAt: string;
  // Last day the license may be used; null for a perpetual license.
  expiresAt: string | null;
  // Builds made after this day need a newer license (MA renewed, or subscription extended).
  updatesUntil: string;
  // Active rider accounts allowed; null is unlimited.
  maxRiders: number | null;
};

export type LicenseStatus = 'unconfigured' | 'trial' | 'unlicensed' | 'active' | 'grace' | 'expired' | 'updatesExpired';

export type LicenseState = {
  status: LicenseStatus;
  // False puts the app in read-only mode: pages and reports work, nothing new can be saved.
  writable: boolean;
  license: License | null;
  // Thai text for admins and the banner on every staff page; null when nothing needs saying.
  message: string | null;
  // Why the stored file was refused, if one is stored but unusable.
  problem: string | null;
};

export const trialDays = 30;
export const graceDays = 30;
export const renewalNoticeDays = 60;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

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

function asLicense(value: Record<string, unknown>): License | null {
  const licensee = value.licensee as Record<string, unknown> | undefined;
  if (value.product !== 'health-rider') return null;
  if (typeof value.licenseId !== 'string' || !value.licenseId) return null;
  if (!licensee || typeof licensee.name !== 'string' || !licensee.name || typeof licensee.hcode !== 'string' || typeof licensee.province !== 'string') return null;
  if (value.type !== 'perpetual' && value.type !== 'subscription') return null;
  if (!isDate(value.issuedAt) || !isDate(value.updatesUntil)) return null;
  if (value.type === 'subscription' ? !isDate(value.expiresAt) : value.expiresAt !== null) return null;
  if (value.maxRiders !== null && !(Number.isInteger(value.maxRiders) && (value.maxRiders as number) > 0)) return null;
  return {
    licenseId: value.licenseId,
    product: 'health-rider',
    licensee: { name: licensee.name, hcode: licensee.hcode, province: licensee.province },
    type: value.type,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt as string | null,
    updatesUntil: value.updatesUntil,
    maxRiders: value.maxRiders as number | null,
  };
}

export type ParsedLicense = { license: License; problem: null } | { license: null; problem: string };

// Checks the signature first, then the fields; any change to the file after signing fails the check.
export function parseSignedLicense(text: string, publicKeyBase64: string): ParsedLicense {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { license: null, problem: 'ไฟล์ license ไม่ใช่ JSON ที่ถูกต้อง' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { license: null, problem: 'ไฟล์ license ไม่ถูกต้อง' };
  const { signature, ...body } = value as Record<string, unknown>;
  if (typeof signature !== 'string') return { license: null, problem: 'ไฟล์ license ไม่มีลายมือชื่อดิจิทัล' };

  let valid = false;
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyBase64, 'base64'), format: 'der', type: 'spki' });
    valid = verify(null, Buffer.from(canonicalJson(body)), key, Buffer.from(signature, 'base64'));
  } catch {
    valid = false;
  }
  if (!valid) return { license: null, problem: 'ลายมือชื่อดิจิทัลไม่ถูกต้อง ไฟล์ถูกแก้ไขหรือไม่ได้ออกโดยผู้พัฒนา' };

  const license = asLicense(body);
  return license ? { license, problem: null } : { license: null, problem: 'ข้อมูลในไฟล์ license ไม่ครบหรือไม่ถูกต้อง' };
}

type Inputs = {
  publicKeyConfigured: boolean;
  parsed: ParsedLicense | null;
  // Bangkok dates as YYYY-MM-DD.
  today: string;
  installedAt: string;
  buildDate: string | null;
};

function thaiDate(date: string): string {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
}

// What the app may do today. A missing license gets a trial so a fresh install works while the file is on its way.
export function evaluateLicense({ publicKeyConfigured, parsed, today, installedAt, buildDate }: Inputs): LicenseState {
  if (!publicKeyConfigured) return { status: 'unconfigured', writable: true, license: null, message: null, problem: null };

  const license = parsed?.license ?? null;
  const problem = parsed && !parsed.license ? parsed.problem : null;

  if (!license) {
    const trialEnds = addDays(installedAt, trialDays);
    if (today <= trialEnds) {
      return { status: 'trial', writable: true, license: null, problem, message: `ยังไม่ได้ติดตั้ง license ใช้งานได้เต็มรูปแบบถึง${thaiDate(trialEnds)} โปรดติดต่อผู้พัฒนาเพื่อรับไฟล์ license` };
    }
    return { status: 'unlicensed', writable: false, license: null, problem, message: 'ยังไม่ได้ติดตั้ง license ระบบเปิดให้ดูข้อมูลได้อย่างเดียว ผู้ดูแลระบบติดตั้งไฟล์ license ได้ที่หน้าตั้งค่าระบบ' };
  }

  if (license.type === 'subscription' && license.expiresAt) {
    if (today > license.expiresAt) {
      const graceEnds = addDays(license.expiresAt, graceDays);
      if (today <= graceEnds) {
        return { status: 'grace', writable: true, license, problem, message: `License หมดอายุแล้วเมื่อ${thaiDate(license.expiresAt)} ใช้งานต่อได้ถึง${thaiDate(graceEnds)} หลังจากนั้นจะดูข้อมูลได้อย่างเดียว โปรดต่ออายุ` };
      }
      return { status: 'expired', writable: false, license, problem, message: `License หมดอายุเมื่อ${thaiDate(license.expiresAt)} ระบบเปิดให้ดูข้อมูลได้อย่างเดียว ต่ออายุแล้วติดตั้งไฟล์ใหม่ที่หน้าตั้งค่าระบบ` };
    }
    const left = daysBetween(today, license.expiresAt);
    return { status: 'active', writable: true, license, problem, message: left <= renewalNoticeDays ? `License จะหมดอายุ${thaiDate(license.expiresAt)} (อีก ${left} วัน) โปรดต่ออายุล่วงหน้า` : null };
  }

  // A perpetual license never stops the version it came with; it only stops newer builds once MA has ended.
  if (buildDate && buildDate > license.updatesUntil) {
    return {
      status: 'updatesExpired', writable: false, license, problem,
      message: `เวอร์ชันนี้ออกหลังวันที่สัญญาดูแลระบบ (MA) สิ้นสุด (${thaiDate(license.updatesUntil)}) ระบบเปิดให้ดูข้อมูลได้อย่างเดียว ต่อ MA หรือกลับไปใช้เวอร์ชันก่อนหน้า`,
    };
  }

  const maLeft = daysBetween(today, license.updatesUntil);
  const message = maLeft < 0
    ? `สัญญาดูแลระบบ (MA) สิ้นสุดเมื่อ${thaiDate(license.updatesUntil)} ใช้เวอร์ชันนี้ต่อได้ แต่จะติดตั้งเวอร์ชันใหม่ไม่ได้จนกว่าจะต่อ MA`
    : maLeft <= renewalNoticeDays ? `สัญญาดูแลระบบ (MA) จะสิ้นสุด${thaiDate(license.updatesUntil)} (อีก ${maLeft} วัน)` : null;
  return { status: 'active', writable: true, license, problem, message };
}

// Writes still allowed in read-only mode: signing in and out, installing a license, and rider work already
// done on the road, so a delivery made before the cut-off is never lost.
const alwaysWritable = [
  /^\/api\/auth\//,
  /^\/api\/admin\/license$/,
  /^\/api\/rider\/sync-events$/,
  /^\/api\/rider\/attempts\/[^/]+\/evidence$/,
  /^\/api\/me\/password$/,
];

export function requestNeedsWritableLicense(method: string, pathname: string): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  if (!pathname.startsWith('/api/')) return false;
  return !alwaysWritable.some((pattern) => pattern.test(pathname));
}
