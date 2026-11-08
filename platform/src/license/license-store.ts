import type { Prisma } from '@prisma/client';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { bangkokDateString, startOfBangkokDay } from '@/lib/time';
import { installationIdFor, newInstallationSecret, readMachineId } from '@/license/installation';
import { clockToleranceMs, evaluateLicense, lastUsableDay, parseTokenKey, type LicenseState } from '@/license/license';
import { licensePublicKey } from '@/license/public-key';
import { revokedKeyIds } from '@/license/revoked';

export const licenseSettingKey = 'license';
// The random half of the installation ID, made the first time the app looks for a license.
export const installationSettingKey = 'license.installation';
// The latest time this install has seen, so a server clock set back to stretch a key is noticed.
export const clockSettingKey = 'license.clock';

// The clock mark moves forward at most once an hour, so checks stay a single read.
const clockStepMs = 3_600_000;

type Tx = Prisma.TransactionClient;
type Values = Map<string, Record<string, unknown>>;

export type LicenseView = LicenseState & { installationId: string | null };

async function settings(): Promise<Values> {
  const rows = await db.systemSetting.findMany({ where: { key: { in: [licenseSettingKey, installationSettingKey, clockSettingKey] } } });
  return new Map(rows.map((row) => [row.key, (row.value ?? {}) as Record<string, unknown>]));
}

async function installationId(values: Values): Promise<string> {
  let secret = values.get(installationSettingKey)?.secret;
  if (typeof secret !== 'string') {
    // Two first requests racing both try to create it; the loser reads the winner's secret.
    await db.systemSetting.upsert({ where: { key: installationSettingKey }, create: { key: installationSettingKey, value: { secret: newInstallationSecret() } }, update: {} });
    const row = await db.systemSetting.findUnique({ where: { key: installationSettingKey } });
    secret = (row?.value as Record<string, unknown> | undefined)?.secret;
  }
  return installationIdFor(String(secret), await readMachineId());
}

async function clockWentBack(values: Values, now: Date): Promise<boolean> {
  const seen = Date.parse(String(values.get(clockSettingKey)?.lastSeen ?? ''));
  if (!Number.isNaN(seen) && now.getTime() < seen - clockToleranceMs) return true;
  if (Number.isNaN(seen) || now.getTime() > seen + clockStepMs) {
    const value = { lastSeen: now.toISOString() };
    await db.systemSetting.upsert({ where: { key: clockSettingKey }, create: { key: clockSettingKey, value }, update: { value } });
  }
  return false;
}

// Read fresh each time (one query, plus a write at most hourly): the proxy runs in its own bundle, so an
// in-memory cache there would keep the lock on after a new key is entered.
export async function currentLicense(now = new Date()): Promise<LicenseView> {
  if (!licensePublicKey) return { ...evaluateLicense({ publicKeyConfigured: false, parsed: null, today: '', clockBack: false }), installationId: null };
  const values = await settings();
  const id = await installationId(values);
  const token = values.get(licenseSettingKey)?.token;
  const state = evaluateLicense({
    publicKeyConfigured: true,
    parsed: typeof token === 'string' ? parseTokenKey(token, { publicKeyBase64: licensePublicKey, installationId: id, revokedKeyIds }) : null,
    today: bangkokDateString(now),
    clockBack: await clockWentBack(values, now),
  });
  return { ...state, installationId: id };
}

export async function currentLicenseState(now = new Date()): Promise<LicenseState> {
  const { installationId: _id, ...state } = await currentLicense(now);
  return state;
}

// Stores a key the vendor issued for this installation. A key that ends sooner than the one in use is refused,
// so pasting an old key by mistake never shortens the license.
export async function activateLicense(token: string, actorId: string | null): Promise<LicenseView> {
  if (!licensePublicKey) throw new DomainError('เวอร์ชันนี้ยังไม่เปิดใช้ระบบ license', 409);
  const current = await currentLicense();
  const parsed = parseTokenKey(token, { publicKeyBase64: licensePublicKey, installationId: current.installationId ?? '', revokedKeyIds });
  if (!parsed.license) throw new DomainError(parsed.problem);
  const license = parsed.license;
  if (current.license && current.status !== 'clockBack' && lastUsableDay(license) < lastUsableDay(current.license)) {
    throw new DomainError(`token key นี้หมดอายุก่อน key ที่ใช้อยู่ (${current.license.keyId}) จึงไม่ได้บันทึก`);
  }
  const value = { token: token.replace(/\s+/g, '') };
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({ where: { key: licenseSettingKey }, create: { key: licenseSettingKey, value, updatedById: actorId }, update: { value, updatedById: actorId } });
    // Entered on the lock screen nobody is signed in; the key's own ID stands in for the actor.
    if (actorId) {
      await audit(tx, {
        actorId, action: 'license.activated', auditableType: 'SystemSetting', auditableId: licenseSettingKey,
        newValues: { keyId: license.keyId, licensee: license.licensee.name, plan: license.plan, expiresAt: license.expiresAt },
      });
    }
  });
  return currentLicense();
}

// Delivery jobs created since the 1st of this month, Bangkok time; compared with the license's monthly figure.
export async function deliveriesThisMonth(now = new Date()): Promise<number> {
  const since = startOfBangkokDay(`${bangkokDateString(now).slice(0, 8)}01`);
  return db.deliveryRequest.count({ where: { createdAt: { gte: since ?? now } } });
}

// Open accounts that hold the rider role, whichever role they are working in.
export const activeRiderWhere = { active: true, pendingApproval: false, roleGrants: { some: { role: 'rider' } } } satisfies Prisma.UserWhereInput;

// Called inside the transaction that creates, approves or reactivates a rider account, or gives an account the rider role.
export async function assertRiderSeatAvailable(tx: Pick<Tx, 'user'>, exceptUserId?: string) {
  const { license } = await currentLicenseState();
  if (!license?.maxRiders) return;
  const riders = await tx.user.count({ where: { ...activeRiderWhere, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) } });
  if (riders >= license.maxRiders) {
    throw new DomainError(`License นี้ใช้ไรเดอร์ได้ไม่เกิน ${license.maxRiders} คน ปิดบัญชีไรเดอร์ที่ไม่ใช้แล้ว หรือติดต่อผู้พัฒนาเพื่อเพิ่มจำนวน`, 409);
  }
}
