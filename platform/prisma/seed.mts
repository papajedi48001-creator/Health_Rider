// Seeds UAT accounts and delivery zones. Run with `npm run db:seed`; safe to run more than once.
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import type { EmploymentCategory, UserRole } from '@prisma/client';
import { ulid } from 'ulidx';
import { createPrismaClient } from '../src/lib/prisma-client.mjs';

type SeedAccount = { username: string; displayName: string; role: UserRole; rider?: { riderCode: string; employmentCategory: EmploymentCategory } };

const uatAccounts: SeedAccount[] = [
  { username: 'pharmacy.uat', displayName: 'เภสัชกร UAT', role: 'pharmacy' },
  { username: 'coordinator.uat', displayName: 'ผู้ประสานงาน UAT', role: 'coordinator' },
  { username: 'rider.internal.uat', displayName: 'ไรเดอร์ภายใน UAT', role: 'rider', rider: { riderCode: 'UAT-INT-01', employmentCategory: 'internal' } },
  { username: 'rider.external.uat', displayName: 'ไรเดอร์ผู้รับจ้าง UAT', role: 'rider', rider: { riderCode: 'UAT-EXT-01', employmentCategory: 'external' } },
  { username: 'admin.uat', displayName: 'ผู้ดูแลระบบ UAT', role: 'admin' },
  { username: 'auditor.uat', displayName: 'ผู้ตรวจสอบ UAT', role: 'auditor' },
];

const prisma = createPrismaClient();

async function main() {
  const password = process.env.SEED_UAT_PASSWORD ?? '';
  if (password.length < 12) {
    throw new Error('SEED_UAT_PASSWORD must be set to at least 12 characters before seeding UAT accounts');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  for (const account of uatAccounts) {
    const user = await prisma.user.upsert({
      where: { username: account.username },
      update: { displayName: account.displayName, role: account.role, passwordHash, active: true },
      create: { id: ulid(), username: account.username, displayName: account.displayName, role: account.role, passwordHash },
    });
    if (account.rider) {
      await prisma.riderProfile.upsert({
        where: { userId: user.id },
        update: { riderCode: account.rider.riderCode, employmentCategory: account.rider.employmentCategory, active: true },
        create: { id: ulid(), userId: user.id, ...account.rider },
      });
    }
  }

  const zones = process.env.SEED_ZONES_FILE ? readZones(process.env.SEED_ZONES_FILE) : [];
  for (const zone of zones) {
    await prisma.deliveryZone.upsert({
      where: { subdistrictCode_villageCode: { subdistrictCode: zone.subdistrictCode, villageCode: zone.villageCode } },
      update: { displayName: zone.displayName, active: true },
      create: { id: ulid(), ...zone },
    });
  }

  console.log(`Seeded ${uatAccounts.length} UAT accounts and ${zones.length} delivery zones`);
}

// CSV columns: subdistrictCode,villageCode,displayName — codes must match HOS patient.tmbpart and patient.moopart.
function readZones(file: string) {
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [subdistrictCode, villageCode, ...name] = line.split(',');
      const displayName = name.join(',').trim();
      // subdistrictCode is HOSxP chwpart+amppart+tmbpart, the same 6 digits the app matches on.
      if (!/^\d{6}$/.test(subdistrictCode?.trim() ?? '') || !villageCode?.trim() || !displayName) throw new Error(`Invalid zone line: ${line}`);
      return { subdistrictCode: subdistrictCode.trim(), villageCode: villageCode.trim().padStart(2, '0'), displayName };
    });
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
