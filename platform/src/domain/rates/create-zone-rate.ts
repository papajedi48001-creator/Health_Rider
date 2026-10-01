import type { ZoneRate } from '@/domain/rates/resolve-zone-rate';

export type CreateZoneRateInput = ZoneRate & { createdById: string };

type ZoneRateRepository = {
  listForZone(zoneId: string): Promise<ZoneRate[]>;
  create(input: CreateZoneRateInput): Promise<ZoneRate>;
};

export class OverlappingZoneRateError extends Error {
  constructor() {
    super('ช่วงวันมีผลของอัตราค่าบริการทับซ้อนกับอัตราเดิม');
  }
}

export async function createZoneRate(
  input: CreateZoneRateInput,
  repository: ZoneRateRepository,
): Promise<ZoneRate> {
  const existingRates = await repository.listForZone(input.deliveryZoneId);
  const overlaps = existingRates.some((rate) => periodsOverlap(input, rate));

  if (overlaps) {
    throw new OverlappingZoneRateError();
  }

  return repository.create(input);
}

function periodsOverlap(left: ZoneRate, right: ZoneRate): boolean {
  const leftEnd = left.effectiveUntil ?? new Date('9999-12-31T00:00:00.000Z');
  const rightEnd = right.effectiveUntil ?? new Date('9999-12-31T00:00:00.000Z');

  return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
}
