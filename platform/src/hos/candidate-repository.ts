import type { HosCandidate, HosVillage, HosVisitDay } from '@/hos/types';

export type HosCandidateRepository = {
  eligibleFor(on: Date): Promise<HosCandidate[]>;
  villagesSince(since: Date): Promise<HosVillage[]>;
  visitsBetween(from: string, to: string): Promise<HosVisitDay[]>;
  // Current name with title for each HN found, keyed by HN.
  patientNames(hns: string[]): Promise<Map<string, string>>;
};
