import type { HosCandidate, HosPatient, HosVillage, HosVisitDay } from '@/hos/types';

export type HosCandidateRepository = {
  eligibleFor(on: Date): Promise<HosCandidate[]>;
  villagesSince(since: Date): Promise<HosVillage[]>;
  visitsBetween(from: string, to: string): Promise<HosVisitDay[]>;
  // Current name with title and registered address for each HN found, keyed by HN.
  patients(hns: string[]): Promise<Map<string, HosPatient>>;
  // Village names from hosp_moo_control keyed by villageKey(subdistrictCode, villageCode); empty when the table is missing.
  villageNames(): Promise<Map<string, string>>;
  // The รพ.สต. (hosp_sname) of each village in hosp_moo_control, keyed the same way; empty when it cannot be read.
  villageHealthCenters(): Promise<Map<string, string>>;
};
