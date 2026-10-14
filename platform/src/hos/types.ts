export type HosCandidate = {
  visitNumber: string;
  hn: string;
  patientName: string;
  patientAge: number | null;
  telephone: string | null;
  deliveryAddress: string;
  subdistrictCode: string;
  villageCode: string;
};

// A candidate as pharmacy sees it: the active delivery zone its HOS address maps to, if any.
export type ZonedCandidate = HosCandidate & { zone: { id: string; displayName: string } | null };

export type HosCandidateRow = {
  visit_number: string | number;
  hn: string | number;
  patient_name: string | Buffer | null;
  patient_age: number | string | null;
  telephone: string | Buffer | null;
  delivery_address: string | Buffer | null;
  subdistrict_code: string | number | null;
  village_code: string | number | null;
};
