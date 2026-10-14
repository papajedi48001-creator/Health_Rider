import { expect, test, vi } from 'vitest';
import { MysqlHosCandidateRepository } from '@/hos/mysql-candidate-repository';

test('maps a legacy HOS row into a read-only candidate DTO', async () => {
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
      villageCode: '01',
    },
  ]);
});

test('queries HOS with the Thai visit date', async () => {
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

test('lists HOS villages once per normalised code with their visit counts', async () => {
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
