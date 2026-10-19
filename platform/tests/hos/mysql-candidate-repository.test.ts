import { beforeEach, expect, test, vi } from 'vitest';

beforeEach(() => clearVillageNameCache());
import { clearVillageNameCache, MysqlHosCandidateRepository } from '@/hos/mysql-candidate-repository';

test('maps a legacy HOSxP row into a read-only candidate DTO', async () => {
  const repository = new MysqlHosCandidateRepository({
    execute: async () => [
      [
        {
          visit_number: 'VN-TEST-001',
          hn: 'HN-TEST-001',
          patient_name: Buffer.from('ทดสอบ', 'utf8'),
          patient_age: 64,
          telephone: '0800000000',
          delivery_address: 'บ้านทดสอบ',
          subdistrict_code: '470907',
          subdistrict_name: 'ต.ปลาโหล',
          village_code: '1',
        },
      ],
    ],
  }, ['100001']);

  await expect(repository.eligibleFor(new Date('2026-10-01T00:00:00.000Z'))).resolves.toEqual([
    {
      visitNumber: 'VN-TEST-001',
      hn: 'HN-TEST-001',
      patientName: 'ทดสอบ',
      patientAge: 64,
      telephone: '0800000000',
      deliveryAddress: 'บ้านทดสอบ',
      subdistrictCode: '470907',
      subdistrictName: 'ต.ปลาโหล',
      villageCode: '01',
    },
  ]);
});

test('queries HOSxP with the Thai visit date', async () => {
  const execute = vi.fn().mockResolvedValue([[]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await repository.eligibleFor(new Date('2026-10-13T18:30:00.000Z'));

  expect(execute).toHaveBeenCalledWith(expect.any(String), ['100001', '2026-10-14']);
});

// HOSxP tmbpart repeats across districts, so zones key on the full province+district+subdistrict code.
test('reads the subdistrict as the full HOSxP address code', async () => {
  const execute = vi.fn().mockResolvedValue([[]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await repository.eligibleFor(new Date('2026-10-13T18:30:00.000Z'));

  expect(execute.mock.calls[0]?.[0]).toContain('CONCAT(p.chwpart, p.amppart, p.tmbpart) AS subdistrict_code');
});

// HOSxP keeps the title (นาย, นาง, ด.ช.) in pname; it joins the first name as written on Thai labels, and a missing title drops out.
test('reads the patient name with its title', async () => {
  const execute = vi.fn().mockResolvedValue([[]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await repository.eligibleFor(new Date('2026-10-13T18:30:00.000Z'));

  expect(execute.mock.calls[0]?.[0]).toContain("CONCAT_WS(' ', CONCAT(COALESCE(p.pname, ''), p.fname), p.lname) AS patient_name");
});

test('looks up current names with their title by HN', async () => {
  const execute = vi.fn().mockResolvedValue([[{ hn: '450014298', patient_name: Buffer.from('นางสมร ศาลารักษ์', 'utf8') }]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await expect(repository.patientNames(['450014298', '450003368'])).resolves.toEqual(new Map([['450014298', 'นางสมร ศาลารักษ์']]));
  expect(execute.mock.calls[0]?.[0]).toContain("CONCAT_WS(' ', CONCAT(COALESCE(p.pname, ''), p.fname), p.lname) AS patient_name");
  expect(execute.mock.calls[0]?.[0]).toContain('WHERE p.hn IN (?, ?)');
  expect(execute.mock.calls[0]?.[1]).toEqual(['450014298', '450003368']);
  await expect(repository.patientNames([])).resolves.toEqual(new Map());
  expect(execute).toHaveBeenCalledTimes(1);
});

test('lists HOSxP villages once per normalised code with their visit counts', async () => {
  const execute = vi.fn().mockResolvedValue([[
    { subdistrict_code: '470603', village_code: '6', subdistrict_name: Buffer.from('ต.ปลาโหล', 'utf8'), visits: 40 },
    { subdistrict_code: '470603', village_code: '06', subdistrict_name: 'ต.ปลาโหล', visits: '8' },
    { subdistrict_code: '470602', village_code: '1', subdistrict_name: null, visits: 3 },
    { subdistrict_code: null, village_code: '1', subdistrict_name: null, visits: 9 },
  ]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await expect(repository.villagesSince(new Date('2026-07-16T00:00:00.000Z'))).resolves.toEqual([
    { subdistrictCode: '470602', villageCode: '01', subdistrictName: null, visits: 3 },
    { subdistrictCode: '470603', villageCode: '06', subdistrictName: 'ต.ปลาโหล', visits: 48 },
  ]);
  expect(execute).toHaveBeenCalledWith(expect.stringContaining('LEFT JOIN thaiaddress'), ['100001', '2026-07-16']);
});

test('lists eligible visits between two Thai dates with the date read as text', async () => {
  const execute = vi.fn().mockResolvedValue([[{ visit_date: '2026-10-16', visit_number: 661016001 }]]);
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await expect(repository.visitsBetween('2026-10-01', '2026-10-31')).resolves.toEqual([{ date: '2026-10-16', visitNumber: '661016001' }]);
  expect(execute).toHaveBeenCalledWith(expect.stringContaining("DATE_FORMAT(o.vstdate, '%Y-%m-%d') AS visit_date"), ['100001', '2026-10-01', '2026-10-31']);
});

const visitRow = { visit_number: 'VN-1', hn: '450014298', patient_name: 'นางสมร ศาลารักษ์', patient_age: 70, telephone: null,
  delivery_address: '154 หมู่ 2 ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร', subdistrict_code: '470602', subdistrict_name: 'ต.ปลาโหล', village_code: '2' };

test('adds the village name from hosp_moo_control to the address', async () => {
  const execute = vi.fn(async (sql: string): Promise<[unknown]> => (sql.includes('hosp_moo_control')
    ? [[{ subdistrict_code: '470602', village_code: '02', village_name: Buffer.from('จิ๋ว', 'utf8') }, { subdistrict_code: '470602', village_code: '03', village_name: 'ดอนยานาง' }]]
    : [[visitRow]]));
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  const [candidate] = await repository.eligibleFor(new Date('2026-10-19T03:00:00Z'));
  expect(candidate?.deliveryAddress).toBe('154 หมู่ 2 บ้านจิ๋ว ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร');
  await expect(repository.villageNames()).resolves.toEqual(new Map([['470602/02', 'จิ๋ว'], ['470602/03', 'ดอนยานาง']]));
});

test('without hosp_moo_control the address is shown as HOSxP has it', async () => {
  const execute = vi.fn(async (sql: string): Promise<[unknown]> => {
    if (sql.includes('hosp_moo_control')) throw new Error("Table 'hos.hosp_moo_control' doesn't exist");
    return [[visitRow]];
  });
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  const [candidate] = await repository.eligibleFor(new Date('2026-10-19T03:00:00Z'));
  expect(candidate?.deliveryAddress).toBe('154 หมู่ 2 ต.ปลาโหล อ.วาริชภูมิ จ.สกลนคร');
});

test('a failed read of hosp_moo_control is tried again on the next page load', async () => {
  let fail = true;
  const execute = vi.fn(async (sql: string): Promise<[unknown]> => {
    if (sql.includes('hosp_moo_control')) {
      if (fail) throw new Error('SELECT command denied');
      return [[{ subdistrict_code: '470602', village_code: '2', village_name: 'จิ๋ว' }]];
    }
    return [[visitRow]];
  });
  const repository = new MysqlHosCandidateRepository({ execute }, ['100001']);

  await expect(repository.villageNames()).resolves.toEqual(new Map());
  fail = false;
  await expect(repository.villageNames()).resolves.toEqual(new Map([['470602/02', 'จิ๋ว']]));
});
