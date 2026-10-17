import type { Prisma } from '@prisma/client';
import { audit } from '@/domain/audit/write-audit-event';
import { DomainError } from '@/domain/errors';
import { db } from '@/lib/db';
import { bangkokDateString, startOfBangkokDay } from '@/lib/time';
import { evaluateLicense, parseSignedLicense, type LicenseState } from '@/license/license';
import { licensePublicKey } from '@/license/public-key';

export const licenseSettingKey = 'license';
// The day the app first checked for a license; the trial runs from it.
export const installedAtSettingKey = 'license.installedAt';

// Day the image was built (YYYY-MM-DD), set in next.config.ts; compared with the license's updatesUntil.
const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE || null;

type Tx = Prisma.TransactionClient;

function storedText(value: unknown): string | null {
  return value && typeof value === 'object' && typeof (value as { text?: unknown }).text === 'string' ? (value as { text: string }).text : null;
}

async function installedAt(now: Date): Promise<string> {
  const row = await db.systemSetting.findUnique({ where: { key: installedAtSettingKey } });
  const date = (row?.value as { date?: unknown } | undefined)?.date;
  if (typeof date === 'string') return date;
  const today = bangkokDateString(now);
  // Two requests racing here both write the same day; the later write is harmless.
  await db.systemSetting.upsert({ where: { key: installedAtSettingKey }, create: { key: installedAtSettingKey, value: { date: today } }, update: {} });
  return today;
}

// Read fresh each time (two small queries, and only on saving calls and page loads): the proxy runs in its own
// bundle, so an in-memory cache there would keep refusing writes after a new license is installed.
export async function currentLicenseState(now = new Date()): Promise<LicenseState> {
  if (!licensePublicKey) return evaluateLicense({ publicKeyConfigured: false, parsed: null, today: '', installedAt: '', buildDate });
  const row = await db.systemSetting.findUnique({ where: { key: licenseSettingKey } });
  const text = storedText(row?.value);
  return evaluateLicense({
    publicKeyConfigured: true,
    parsed: text ? parseSignedLicense(text, licensePublicKey) : null,
    today: bangkokDateString(now),
    installedAt: await installedAt(now),
    buildDate,
  });
}

export async function installLicense(text: string, adminId: string): Promise<LicenseState> {
  if (!licensePublicKey) throw new DomainError('เวอร์ชันนี้ยังไม่เปิดใช้ระบบ license', 409);
  const parsed = parseSignedLicense(text.trim(), licensePublicKey);
  if (!parsed.license) throw new DomainError(parsed.problem);
  const license = parsed.license;
  await db.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: licenseSettingKey },
      create: { key: licenseSettingKey, value: { text: text.trim() }, updatedById: adminId },
      update: { value: { text: text.trim() }, updatedById: adminId },
    });
    await audit(tx, {
      actorId: adminId, action: 'license.installed', auditableType: 'SystemSetting', auditableId: licenseSettingKey,
      newValues: { licenseId: license.licenseId, licensee: license.licensee.name, type: license.type, expiresAt: license.expiresAt, updatesUntil: license.updatesUntil },
    });
  });
  return currentLicenseState();
}

// Delivery jobs created since the 1st of this month, Bangkok time; compared with the license tier.
export async function deliveriesThisMonth(now = new Date()): Promise<number> {
  const since = startOfBangkokDay(`${bangkokDateString(now).slice(0, 8)}01`);
  return db.deliveryRequest.count({ where: { createdAt: { gte: since ?? now } } });
}

// Called inside the transaction that creates, approves or reactivates a rider account.
export async function assertRiderSeatAvailable(tx: Tx, exceptUserId?: string) {
  const { license } = await currentLicenseState();
  if (!license?.maxRiders) return;
  const riders = await tx.user.count({ where: { role: 'rider', active: true, pendingApproval: false, ...(exceptUserId ? { id: { not: exceptUserId } } : {}) } });
  if (riders >= license.maxRiders) {
    throw new DomainError(`License นี้ใช้ไรเดอร์ได้ไม่เกิน ${license.maxRiders} คน ปิดบัญชีไรเดอร์ที่ไม่ใช้แล้ว หรือติดต่อผู้พัฒนาเพื่อเพิ่มจำนวน`, 409);
  }
}
