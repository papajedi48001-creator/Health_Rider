import { expect, test } from 'vitest';
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
