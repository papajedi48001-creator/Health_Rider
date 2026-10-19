import mysql from 'mysql2/promise';
import { HosUnavailableError, loadHosConfig, type HosConnection } from '@/hos/hos-settings';
import { db } from '@/lib/db';
import { bangkokDateString } from '@/lib/time';
import type { HosCandidateRepository } from '@/hos/candidate-repository';
import type { HosCandidate, HosCandidateRow, HosVillage, HosVillageRow, HosVisitDay, HosVisitDayRow } from '@/hos/types';

type ReadOnlyConnection = {
  execute(sql: string, values?: unknown): Promise<[unknown, ...unknown[]]>;
};

// The title (pname) joins the first name as Thai labels write it; a missing title drops out.
const patientNameSql = "CONCAT_WS(' ', CONCAT(COALESCE(p.pname, ''), p.fname), p.lname)";

function candidateQuery(itemCodeCount: number): string {
  const itemCodePlaceholders = Array.from({ length: itemCodeCount }, () => '?').join(', ');
  return `
  SELECT DISTINCT
    o.vn AS visit_number,
    o.hn AS hn,
    ${patientNameSql} AS patient_name,
    TIMESTAMPDIFF(YEAR, p.birthday, o.vstdate) AS patient_age,
    COALESCE(NULLIF(p.mobile_phone_number, ''), NULLIF(p.hometel, ''), NULLIF(p.informtel, '')) AS telephone,
    p.informaddr AS delivery_address,
    CONCAT(p.chwpart, p.amppart, p.tmbpart) AS subdistrict_code,
    t.full_name AS subdistrict_name,
    p.moopart AS village_code
  FROM opitemrece AS o
  INNER JOIN patient AS p ON p.hn = o.hn
  LEFT JOIN thaiaddress AS t ON t.addressid = CONCAT(p.chwpart, p.amppart, p.tmbpart)
  WHERE o.icode IN (${itemCodePlaceholders}) AND o.vstdate = ?
`;
}

function villageQuery(itemCodeCount: number): string {
  const itemCodePlaceholders = Array.from({ length: itemCodeCount }, () => '?').join(', ');
  return `
  SELECT
    CONCAT(p.chwpart, p.amppart, p.tmbpart) AS subdistrict_code,
    TRIM(p.moopart) AS village_code,
    t.full_name AS subdistrict_name,
    COUNT(DISTINCT o.vn) AS visits
  FROM opitemrece AS o
  INNER JOIN patient AS p ON p.hn = o.hn
  LEFT JOIN thaiaddress AS t ON t.addressid = CONCAT(p.chwpart, p.amppart, p.tmbpart)
  WHERE o.icode IN (${itemCodePlaceholders}) AND o.vstdate >= ?
  GROUP BY subdistrict_code, village_code, subdistrict_name
`;
}

// The date comes back as text so the driver's time zone cannot shift it by a day.
function visitDayQuery(itemCodeCount: number): string {
  const itemCodePlaceholders = Array.from({ length: itemCodeCount }, () => '?').join(', ');
  return `
  SELECT DISTINCT
    DATE_FORMAT(o.vstdate, '%Y-%m-%d') AS visit_date,
    o.vn AS visit_number
  FROM opitemrece AS o
  WHERE o.icode IN (${itemCodePlaceholders}) AND o.vstdate BETWEEN ? AND ?
`;
}

// One row per visit even when several eligible items were dispensed in it.
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
      bangkokDateString(on),
    ]);

    return (rows as HosCandidateRow[]).map(mapCandidate);
  }

  // Eligible visits between two Thai dates, inclusive.
  async visitsBetween(from: string, to: string): Promise<HosVisitDay[]> {
    if (this.eligibleItemCodes.length === 0) {
      return [];
    }

    const [rows] = await this.connection.execute(visitDayQuery(this.eligibleItemCodes.length), [...this.eligibleItemCodes, from, to]);
    return (rows as HosVisitDayRow[]).map((row) => ({ date: String(row.visit_date), visitNumber: String(row.visit_number) }));
  }

  async patientNames(hns: string[]): Promise<Map<string, string>> {
    if (hns.length === 0) return new Map();
    const placeholders = hns.map(() => '?').join(', ');
    const [rows] = await this.connection.execute(`SELECT p.hn AS hn, ${patientNameSql} AS patient_name FROM patient AS p WHERE p.hn IN (${placeholders})`, hns);
    return new Map((rows as Array<{ hn: string | number; patient_name: string | Buffer | null }>).map((row) => [String(row.hn), decodeLegacyText(row.patient_name)]));
  }

  // Villages are normalised the same way as candidates, so "6" and "06" fold into one zone.
  async villagesSince(since: Date): Promise<HosVillage[]> {
    if (this.eligibleItemCodes.length === 0) {
      return [];
    }

    const [rows] = await this.connection.execute(villageQuery(this.eligibleItemCodes.length), [
      ...this.eligibleItemCodes,
      bangkokDateString(since),
    ]);

    const villages = new Map<string, HosVillage>();
    for (const row of rows as HosVillageRow[]) {
      const subdistrictCode = String(row.subdistrict_code ?? '').trim();
      const villageCode = normaliseVillageCode(row.village_code);
      if (!/^\d{6}$/.test(subdistrictCode)) continue;
      const key = `${subdistrictCode}/${villageCode}`;
      const village = villages.get(key) ?? { subdistrictCode, villageCode, subdistrictName: blankToNull(decodeLegacyText(row.subdistrict_name)), visits: 0 };
      village.visits += Number(row.visits);
      villages.set(key, village);
    }
    return [...villages.values()].sort((left, right) =>
      left.subdistrictCode.localeCompare(right.subdistrictCode) || left.villageCode.localeCompare(right.villageCode));
  }
}

const globalForHos = globalThis as unknown as { hosPool?: { key: string; pool: mysql.Pool } };

// Reuses one small read-only pool per process for the settings in effect, replacing it when an admin changes them.
export async function getHosCandidateRepository(environment: Record<string, string | undefined> = process.env): Promise<HosCandidateRepository> {
  const config = await loadHosConfig(environment, db.systemSetting);
  if (!config.connection) throw new HosUnavailableError(config.problem ?? 'ยังไม่ได้ตั้งการเชื่อมต่อ HOSxP ตั้งได้ที่เมนู "ตั้งค่าระบบ"');
  if (config.eligibleItemCodes.length === 0) throw new HosUnavailableError('ยังไม่ได้ตั้งรหัสยาที่ส่งถึงบ้านได้ (icode) ตั้งได้ที่เมนู "ตั้งค่าระบบ"');

  const key = JSON.stringify(config.connection);
  if (globalForHos.hosPool?.key !== key) {
    void globalForHos.hosPool?.pool.end().catch(() => undefined);
    globalForHos.hosPool = { key, pool: createReadOnlyPool(config.connection) };
  }
  const pool = globalForHos.hosPool.pool;
  return new MysqlHosCandidateRepository({
    execute: async (sql, values) => {
      try {
        return await pool.execute(sql, values as mysql.ExecuteValues);
      } catch (error) {
        console.error('HOSxP query failed:', error);
        throw new HosUnavailableError(describeHosError(error));
      }
    },
  }, config.eligibleItemCodes);
}

function createReadOnlyPool(connection: HosConnection): mysql.Pool {
  const pool = mysql.createPool({ ...connection, charset: 'TIS620', connectionLimit: 2, connectTimeout: 10_000 });
  // Belt and braces with the SELECT-only HOSxP account: each new connection refuses writes. The command is
  // queued on the connection before any query this repository sends.
  pool.pool.on('connection', (poolConnection) => {
    poolConnection.query('SET SESSION TRANSACTION READ ONLY', (error) => {
      // Older servers (before MySQL 5.6.5 / MariaDB 10.0) do not know the statement; the account's grants still apply.
      if (error) console.warn('HOSxP connection could not be set read-only:', error.message);
    });
  });
  return pool;
}

// Turns a driver error into a reason an admin can act on, without echoing the password.
export function describeHosError(error: unknown): string {
  const { code, sqlMessage } = (error ?? {}) as { code?: string; sqlMessage?: string };
  switch (code) {
    case 'ECONNREFUSED':
      return 'เซิร์ฟเวอร์ HOSxP ปฏิเสธการเชื่อมต่อ ตรวจ host และ port';
    case 'ETIMEDOUT':
    case 'ENOTFOUND':
    case 'EHOSTUNREACH':
    case 'ENETUNREACH':
      return 'ติดต่อเซิร์ฟเวอร์ HOSxP ไม่ได้ ตรวจ host และ firewall ระหว่างเครื่องแอปกับเครื่อง HOSxP';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'HOSxP ไม่ยอมรับชื่อผู้ใช้หรือรหัสผ่าน หรือบัญชีนี้ไม่ได้รับอนุญาตจาก IP ของเครื่องแอป';
    case 'ER_DBACCESS_DENIED_ERROR':
      return 'บัญชี HOSxP นี้ไม่มีสิทธิ์อ่านฐานข้อมูลที่ระบุ';
    case 'ER_BAD_DB_ERROR':
      return 'ไม่พบฐานข้อมูล HOSxP ชื่อนี้';
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_NO_SUCH_TABLE':
      return `บัญชี HOSxP อ่านตารางที่ต้องใช้ไม่ได้: ${sqlMessage ?? code}`;
    default:
      return `อ่านข้อมูลจาก HOSxP ไม่ได้${code ? ` (${code})` : ''}`;
  }
}

export type HosConnectionTest = {
  version: string;
  tables: Array<{ name: string; ok: boolean; message: string | null }>;
  items: Array<{ code: string; name: string | null }>;
};

const requiredTables = ['opitemrece', 'patient', 'thaiaddress'];

// Checks a HOSxP connection the way the app uses it: can log in, read the tables it needs, and find the item codes.
export async function testHosConnection(connection: HosConnection, eligibleItemCodes: readonly string[]): Promise<HosConnectionTest> {
  let client: mysql.Connection;
  try {
    client = await mysql.createConnection({ ...connection, charset: 'TIS620', connectTimeout: 10_000 });
  } catch (error) {
    throw new HosUnavailableError(describeHosError(error));
  }
  try {
    await client.query('SET SESSION TRANSACTION READ ONLY').catch(() => undefined);
    const [versionRows] = await client.query('SELECT VERSION() AS version');
    const version = String((versionRows as Array<{ version: unknown }>)[0]?.version ?? '');

    const tables: HosConnectionTest['tables'] = [];
    for (const name of requiredTables) {
      try {
        await client.query(`SELECT 1 FROM \`${name}\` LIMIT 0`);
        tables.push({ name, ok: true, message: null });
      } catch (error) {
        tables.push({ name, ok: false, message: describeHosError(error) });
      }
    }

    const names = new Map<string, string>();
    if (eligibleItemCodes.length > 0) {
      const placeholders = eligibleItemCodes.map(() => '?').join(', ');
      for (const table of ['drugitems', 'nondrugitems']) {
        try {
          const [rows] = await client.execute(`SELECT icode, name FROM \`${table}\` WHERE icode IN (${placeholders})`, [...eligibleItemCodes]);
          for (const row of rows as Array<{ icode: unknown; name: string | Buffer | null }>) {
            names.set(String(row.icode), decodeLegacyText(row.name));
          }
        } catch {
          // Item names are a convenience; a missing grant on one item table does not fail the test.
        }
      }
    }
    return { version, tables, items: eligibleItemCodes.map((code) => ({ code, name: names.get(code) ?? null })) };
  } catch (error) {
    throw new HosUnavailableError(describeHosError(error));
  } finally {
    await client.end().catch(() => undefined);
  }
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
    subdistrictName: blankToNull(decodeLegacyText(row.subdistrict_name)),
    villageCode: normaliseVillageCode(row.village_code),
  };
}

function normaliseVillageCode(value: string | number | null): string {
  return String(value ?? '').trim().padStart(2, '0');
}

function decodeLegacyText(value: string | Buffer | null): string {
  if (value === null) return '';
  return Buffer.isBuffer(value) ? value.toString('utf8').trim() : value.trim();
}

function blankToNull(value: string): string | null {
  return value === '' ? null : value;
}
