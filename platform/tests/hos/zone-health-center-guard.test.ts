import { expect, test, vi } from 'vitest';

vi.mock('@/hos/mysql-candidate-repository', () => ({ getHosCandidateRepository: vi.fn() }));

const zone = { subdistrictCode: '470603', villageCode: '12', displayName: 'หมู่ 12 บ้านโนนสวรรค์', healthCenter: null };

test('a QR goes out for a zone whose รพ.สต. admin chose, without asking HOSxP', async () => {
  const { ensureZoneHasHealthCenter } = await import('@/hos/village-health-centers');
  const fromHos = vi.fn();
  await expect(ensureZoneHasHealthCenter({ ...zone, healthCenter: { name: 'รพ.สต.ปลาโหล' } }, fromHos)).resolves.toBe('รพ.สต.ปลาโหล');
  expect(fromHos).not.toHaveBeenCalled();
});

test('falls back to the รพ.สต. HOSxP maps the village to', async () => {
  const { ensureZoneHasHealthCenter } = await import('@/hos/village-health-centers');
  await expect(ensureZoneHasHealthCenter(zone, async () => new Map([['470603/12', 'รพ.สต.โนนสวรรค์']]))).resolves.toBe('รพ.สต.โนนสวรรค์');
});

test('refuses a zone no รพ.สต. looks after, naming the zone and where to fix it', async () => {
  const { ensureZoneHasHealthCenter } = await import('@/hos/village-health-centers');
  const refused = ensureZoneHasHealthCenter(zone, async () => new Map());
  await expect(refused).rejects.toMatchObject({ status: 409 });
  await expect(ensureZoneHasHealthCenter(zone, async () => new Map())).rejects.toThrow(/หมู่ 12 บ้านโนนสวรรค์ ยังไม่มี รพ.สต. รับผิดชอบ.*เมนูโซนจัดส่ง/);
});
