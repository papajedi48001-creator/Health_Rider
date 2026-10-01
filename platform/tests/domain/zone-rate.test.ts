import { expect, test } from 'vitest';
import { createZoneRate, OverlappingZoneRateError } from '@/domain/rates/create-zone-rate';
import { resolveZoneRate } from '@/domain/rates/resolve-zone-rate';

const octoberRate = {
  id: '01J00000000000000000000100',
  deliveryZoneId: '01J00000000000000000000099',
  satang: 2500,
  effectiveFrom: new Date('2026-10-01T00:00:00.000Z'),
  effectiveUntil: null,
};

test('resolves the 2,500 satang rate effective on 1 October', async () => {
  const repository = { listForZone: async () => [octoberRate] };

  await expect(
    resolveZoneRate('01J00000000000000000000099', new Date('2026-10-01T12:00:00.000Z'), repository),
  ).resolves.toEqual(octoberRate);
});

test('rejects an overlapping rate period for the same zone', async () => {
  const repository = {
    listForZone: async () => [octoberRate],
    create: async () => octoberRate,
  };

  await expect(
    createZoneRate(
      {
        id: '01J00000000000000000000101',
        deliveryZoneId: octoberRate.deliveryZoneId,
        satang: 3000,
        effectiveFrom: new Date('2026-10-15T00:00:00.000Z'),
        effectiveUntil: null,
        createdById: '01J00000000000000000000001',
      },
      repository,
    ),
  ).rejects.toBeInstanceOf(OverlappingZoneRateError);
});
