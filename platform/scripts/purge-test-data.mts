// Deletes trial deliveries whose HOSxP order is dated before a cut-off, with everything hanging off them
// (attempts, QR tokens, evidence and its photos, offline events, sync conflicts, audit events).
// Lists what it would delete unless --confirm is given:
//   node scripts/purge-test-data.mts --before 2026-10-20 [--confirm]
// The order date comes from the HOSxP visit number (YYMMDDhhmmss, Buddhist year); a request without one
// falls back to the day it was created here (Bangkok time).
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { createPrismaClient } from '../src/lib/prisma-client.mjs';

const visitNumberPattern = /^(\d{2})(\d{2})(\d{2})\d{6}$/;

export function orderDate(hosVisitNumber: string | null, createdAt: Date): { date: string; source: 'vn' | 'created' } {
  const match = hosVisitNumber ? visitNumberPattern.exec(hosVisitNumber) : null;
  if (match) {
    const year = 2500 + Number(match[1]) - 543;
    const date = `${year}-${match[2]}-${match[3]}`;
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return { date, source: 'vn' };
  }
  const bangkok = new Date(createdAt.getTime() + 7 * 60 * 60 * 1000);
  return { date: bangkok.toISOString().slice(0, 10), source: 'created' };
}

function parseArguments(argv: string[]): { before: string; confirm: boolean } {
  const index = argv.indexOf('--before');
  const before = index >= 0 ? argv[index + 1] ?? '' : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before)) throw new Error('Pass --before YYYY-MM-DD (Christian year), e.g. --before 2026-10-20');
  return { before, confirm: argv.includes('--confirm') };
}

async function main() {
  const { before, confirm } = parseArguments(process.argv.slice(2));
  const prisma = createPrismaClient();
  try {
    const requests = await prisma.deliveryRequest.findMany({ select: { id: true, hosVisitNumber: true, createdAt: true } });
    const byDate = new Map<string, number>();
    const doomed = requests.filter((request) => {
      const { date, source } = orderDate(request.hosVisitNumber, request.createdAt);
      const keep = date >= before;
      const label = `${date} (${source === 'vn' ? 'VN' : 'สร้างในระบบ'}) ${keep ? 'เก็บไว้' : 'ลบ'}`;
      byDate.set(label, (byDate.get(label) ?? 0) + 1);
      return !keep;
    });
    const requestIds = doomed.map((request) => request.id);
    const attempts = await prisma.deliveryAttempt.findMany({ where: { deliveryRequestId: { in: requestIds } }, select: { id: true } });
    const attemptIds = attempts.map((attempt) => attempt.id);
    const byAttempt = { deliveryAttemptId: { in: attemptIds } };
    const [evidence, events, conflicts, tokens] = await Promise.all([
      prisma.deliveryEvidence.findMany({ where: byAttempt, select: { id: true } }),
      prisma.offlineDeliveryEvent.findMany({ where: byAttempt, select: { id: true } }),
      prisma.syncConflict.findMany({ where: byAttempt, select: { id: true } }),
      prisma.packageQrToken.count({ where: byAttempt }),
    ]);
    const auditIds = [...requestIds, ...attemptIds, ...evidence.map((row) => row.id), ...events.map((row) => row.id), ...conflicts.map((row) => row.id)];
    const audits = await prisma.auditEvent.count({ where: { auditableId: { in: auditIds } } });

    console.log(`รายการจัดส่งทั้งหมด ${requests.length} รายการ แยกตามวันที่ออร์เดอร์:`);
    for (const [label, count] of [...byDate.entries()].sort()) console.log(`  ${label}: ${count}`);
    console.log(`จะลบออร์เดอร์ก่อน ${before}: รายการจัดส่ง ${requestIds.length}, งานจัดส่ง ${attemptIds.length}, QR ${tokens}, หลักฐาน ${evidence.length}, เหตุการณ์ออฟไลน์ ${events.length}, ข้อขัดแย้ง ${conflicts.length}, ประวัติการแก้ไข ${audits}`);

    if (!confirm) {
      console.log('ยังไม่ได้ลบอะไร ตรวจตัวเลขด้านบนแล้วรันซ้ำโดยเติม --confirm เพื่อลบจริง');
      return;
    }

    await prisma.$transaction([
      prisma.syncConflict.deleteMany({ where: byAttempt }),
      prisma.offlineDeliveryEvent.deleteMany({ where: byAttempt }),
      prisma.deliveryEvidence.deleteMany({ where: byAttempt }),
      prisma.packageQrToken.deleteMany({ where: byAttempt }),
      prisma.deliveryAttempt.deleteMany({ where: { id: { in: attemptIds } } }),
      prisma.deliveryRequest.deleteMany({ where: { id: { in: requestIds } } }),
      prisma.auditEvent.deleteMany({ where: { auditableId: { in: auditIds } } }),
    ]);

    // Photos live in <EVIDENCE_STORAGE_PATH>/<attemptId>/; remove them once the rows are gone.
    const root = process.env.EVIDENCE_STORAGE_PATH?.trim();
    if (root) {
      for (const attemptId of attemptIds) await rm(path.join(path.resolve(root), attemptId), { recursive: true, force: true });
    } else {
      console.log('ไม่ได้ตั้ง EVIDENCE_STORAGE_PATH จึงไม่ได้ลบไฟล์รูปหลักฐาน');
    }
    console.log('ลบเรียบร้อยแล้ว');
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
