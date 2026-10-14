import type { HosCandidate, HosVillage } from '@/hos/types';

export type HosCandidateRepository = {
  eligibleFor(on: Date): Promise<HosCandidate[]>;
  villagesSince(since: Date): Promise<HosVillage[]>;
};
