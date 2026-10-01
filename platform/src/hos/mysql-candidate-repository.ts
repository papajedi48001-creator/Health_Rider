import mysql from 'mysql2/promise';
import { getHosDatabaseUrl } from '@/lib/env';
import type { HosCandidateRepository } from '@/hos/candidate-repository';
import type { HosCandidate, HosCandidateRow } from '@/hos/types';

type ReadOnlyConnection = {
  execute(sql: string, values?: unknown): Promise<[unknown, ...unknown[]]>;
};

function candidateQuery(itemCodeCount: number): string {
  const itemCodePlaceholders = Array.from({ length: itemCodeCount }, () => '?').join(', ');
  return `
  SELECT
    o.vn AS visit_number,
    o.hn AS hn,
    CONCAT_WS(' ', p.fname, p.lname) AS patient_name,
    NULL AS patient_age,
    COALESCE(NULLIF(p.mobile_phone_number, ''), NULLIF(p.hometel, ''), NULLIF(p.informtel, '')) AS telephone,
    p.informaddr AS delivery_address,
    p.tmbpart AS subdistrict_code,
    p.moopart AS village_code
  FROM opitemrece AS o
  INNER JOIN patient AS p ON p.hn = o.hn
  WHERE o.icode IN (${itemCodePlaceholders}) AND o.vstdate = ?
`;
}

export class MysqlHosCandidateRepository implements HosCandidateRepository {
  constructor(
    private readonly connection: ReadOnlyConnection,
    private readonly eligibleItemCodes: readonly string[] = [],
  ) {}

  async eligibleFor(on: Date): Promise<HosCandidate[]> {
    if (this.eligibleItemCodes.length === 0) {
      return [];
    }

    const [rows] = await this.connection.execute(candidateQuery(this.eligibleItemCodes.length), [
      ...this.eligibleItemCodes,
      on.toISOString().slice(0, 10),
    ]);

    return (rows as HosCandidateRow[]).map(mapCandidate);
  }
}

export function createMysqlHosCandidateRepository(environment: Record<string, string | undefined>): HosCandidateRepository {
  const pool = mysql.createPool({
    uri: getHosDatabaseUrl(environment),
    charset: 'TIS620',
    connectionLimit: 2,
  });
  const eligibleItemCodes = (environment.HOS_ELIGIBLE_ITEM_CODES ?? '')
    .split(',')
    .map((code) => code.trim())
    .filter(Boolean);

  return new MysqlHosCandidateRepository({
    execute: (sql, values) => pool.execute(sql, values as mysql.ExecuteValues),
  }, eligibleItemCodes);
}

function mapCandidate(row: HosCandidateRow): HosCandidate {
  return {
    visitNumber: String(row.visit_number),
    hn: String(row.hn),
    patientName: decodeLegacyText(row.patient_name),
    patientAge: row.patient_age === null ? null : Number(row.patient_age),
    telephone: blankToNull(decodeLegacyText(row.telephone)),
    deliveryAddress: decodeLegacyText(row.delivery_address),
    subdistrictCode: String(row.subdistrict_code ?? '').trim(),
    villageCode: String(row.village_code ?? '').trim().padStart(2, '0'),
  };
}

function decodeLegacyText(value: string | Buffer | null): string {
  if (value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8').trim() : value.trim();
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value;
}
