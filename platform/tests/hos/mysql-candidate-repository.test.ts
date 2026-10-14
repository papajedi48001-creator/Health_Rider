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
          subdistrict_code: '46',
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
      subdistrictCode: '46',
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
