import { afterAll, expect, test } from 'vitest';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { claimPackageQr } from '@/domain/delivery/claim-package-qr';
import { issuePackageQr } from '@/domain/delivery/issue-package-qr';
import { newPublicId } from '@/domain/delivery/status';

const databaseUrl = process.env.DATABASE_URL;
const ids = { user: newPublicId(), riderA: newPublicId(), riderB: newPublicId(), zone: newPublicId(), request: newPublicId(), attempt: newPublicId() };

test.skipIf(!databaseUrl)('MariaDB permits only one concurrent QR claim', async () => {
  await db.user.create({ data: { id: ids.user, username: `test-${ids.user}`, passwordHash: 'not-a-login', displayName: 'Test', role: 'pharmacy' } });
  await db.user.createMany({ data: [
    { id: ids.riderA, username: `test-${ids.riderA}`, passwordHash: 'not-a-login', displayName: 'Rider A', role: 'rider' },
    { id: ids.riderB, username: `test-${ids.riderB}`, passwordHash: 'not-a-login', displayName: 'Rider B', role: 'rider' },
  ] });
  await db.deliveryZone.create({ data: { id: ids.zone, subdistrictCode: '99', villageCode: '99', displayName: 'Test zone' } });
  await db.deliveryRequest.create({ data: {
    id: ids.request, hn: 'TEST-HN', patientName: 'Test', patientAge: null, telephone: null, deliveryAddress: 'Test',
    deliveryZoneId: ids.zone, rateSatangSnapshot: 1, rateEffectiveOn: new Date('2026-10-01'), createdById: ids.user,
  } });
  await db.deliveryAttempt.create({ data: { id: ids.attempt, deliveryRequestId: ids.request, status: 'prepared' } });
  const token = await issuePackageQr(ids.attempt, new Date(Date.now() + 60_000), {
    create: async (record) => { await db.packageQrToken.create({ data: record }); },
  });
  const claim = (riderId: string) => db.$transaction((tx) => claimPackageQr(token, riderId, new Date(), {
    transaction: (work) => work({
      findToken: (tokenHash) => tx.packageQrToken.findUnique({ where: { tokenHash } }).then((record) => record && ({ attemptId: record.deliveryAttemptId, expiresAt: record.expiresAt, invalidatedAt: record.invalidatedAt })),
      claimPreparedAttempt: async (attemptId, riderId, claimedAt) => (await tx.deliveryAttempt.updateMany({ where: { id: attemptId, riderId: null, status: 'prepared' }, data: { riderId, status: 'claimed', claimedAt } })).count === 1,
      invalidateToken: async (attemptId) => { await tx.packageQrToken.updateMany({ where: { deliveryAttemptId: attemptId, invalidatedAt: null }, data: { invalidatedAt: new Date() } }); },
    }),
  }), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  const results = await Promise.all([claim(ids.riderA), claim(ids.riderB)]);
  expect(results.filter((result) => result.kind === 'claimed')).toHaveLength(1);
  expect(results.filter((result) => result.kind === 'conflict')).toHaveLength(1);
});

afterAll(async () => {
  if (!databaseUrl) return;
  await db.packageQrToken.deleteMany({ where: { deliveryAttemptId: ids.attempt } });
  await db.deliveryAttempt.deleteMany({ where: { id: ids.attempt } });
  await db.deliveryRequest.deleteMany({ where: { id: ids.request } });
  await db.deliveryZone.deleteMany({ where: { id: ids.zone } });
  await db.user.deleteMany({ where: { id: { in: [ids.riderA, ids.riderB] } } });
  await db.user.deleteMany({ where: { id: ids.user } });
  await db.$disconnect();
});
