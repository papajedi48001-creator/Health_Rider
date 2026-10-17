export type HosCandidate = {
  visitNumber: string;
  hn: string;
  patientName: string;
  patientAge: number | null;
  telephone: string | null;
  deliveryAddress: string;
  subdistrictCode: string;
  subdistrictName: string | null;
  villageCode: string;
};

// A candidate as pharmacy sees it: the active delivery zone its HOSxP address maps to, if any.
export type ZonedCandidate = HosCandidate & { zone: { id: string; displayName: string } | null };

export type HosCandidateRow = {
  visit_number: string | number;
  hn: string | number;
  patient_name: string | Buffer | null;
  patient_age: number | string | null;
  telephone: string | Buffer | null;
  delivery_address: string | Buffer | null;
  subdistrict_code: string | number | null;
  subdistrict_name: string | Buffer | null;
  village_code: string | number | null;
};

// A HOSxP village with eligible visits, used to set up delivery zones.
export type HosVillage = {
  subdistrictCode: string;
  villageCode: string;
  subdistrictName: string | null;
  visits: number;
};

export type HosVillageRow = {
  subdistrict_code: string | number | null;
  village_code: string | number | null;
  subdistrict_name: string | Buffer | null;
  visits: number | string;
};

// An eligible visit and its Thai service date, used to mark busy days on the calendar.
export type HosVisitDay = { date: string; visitNumber: string };

export type HosVisitDayRow = { visit_date: string; visit_number: string | number };
