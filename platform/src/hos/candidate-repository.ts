import type { HosCandidate } from '@/hos/types';

export type HosCandidateRepository = {
  eligibleFor(on: Date): Promise<HosCandidate[]>;
};
