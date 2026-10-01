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
