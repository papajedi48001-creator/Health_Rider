import { expect, test } from 'vitest';
import { HosUnavailableError, loadHosConfig, parseHosSettingsInput, parseItemCodes, publicHosSettings, sealHosSettings } from '@/hos/hos-settings';
import { describeHosError } from '@/hos/mysql-candidate-repository';

const environment = { AUTH_SECRET: 'x'.repeat(48) };
const noStored = { findUnique: async () => null };

test('reads the HOSxP settings from .env when none were saved', async () => {
  const config = await loadHosConfig({ ...environment, HOS_DATABASE_URL: 'mysql://reader:p%40ss@192.168.1.254:3307/hos', HOS_ELIGIBLE_ITEM_CODES: '100, 200,,100' }, noStored);
  expect(config).toEqual({
    source: 'env',
    connection: { host: '192.168.1.254', port: 3307, user: 'reader', password: 'p@ss', database: 'hos' },
    eligibleItemCodes: ['100', '200'],
    problem: null,
  });
  expect(await loadHosConfig(environment, noStored)).toMatchObject({ source: 'none', connection: null });
});

test('saved settings win over .env and keep the password encrypted', async () => {
  const value = sealHosSettings({ host: 'hosxp', port: 3306, user: 'reader', password: 'secret', database: 'hos', eligibleItemCodes: ['1'] }, environment);
  expect(JSON.stringify(value)).not.toContain('secret');
  const store = { findUnique: async () => ({ value }) };

  const config = await loadHosConfig({ ...environment, HOS_DATABASE_URL: 'mysql://other:x@elsewhere/hos' }, store);
  expect(config.source).toBe('system');
  expect(config.connection).toEqual({ host: 'hosxp', port: 3306, user: 'reader', password: 'secret', database: 'hos' });
  expect(publicHosSettings(config)).not.toHaveProperty('password');

  const rotated = await loadHosConfig({ AUTH_SECRET: 'y'.repeat(48) }, store);
  expect(rotated.connection).toBeNull();
  expect(rotated.problem).toContain('AUTH_SECRET');
});

test('a blank password on the form keeps the password in effect', async () => {
  const current = await loadHosConfig({ ...environment, HOS_DATABASE_URL: 'mysql://reader:old@hosxp/hos' }, noStored);
  const input = parseHosSettingsInput({ host: '192.168.1.254', port: '3306', user: 'reader', database: 'hos', password: '', eligibleItemCodes: '100\n200' }, current);
  expect(input).toEqual({ host: '192.168.1.254', port: 3306, user: 'reader', password: 'old', database: 'hos', eligibleItemCodes: ['100', '200'] });

  const none = await loadHosConfig(environment, noStored);
  expect(() => parseHosSettingsInput({ host: 'h', port: 3306, user: 'u', database: 'hos' }, none)).toThrow('ต้องระบุรหัสผ่าน');
  expect(() => parseHosSettingsInput({ host: 'h; DROP', port: 3306, user: 'u', database: 'hos', password: 'p' }, none)).toThrow('host');
  expect(() => parseHosSettingsInput({ host: 'h', port: 3306, user: 'u', database: 'hos`x', password: 'p' }, none)).toThrow('ชื่อฐานข้อมูล');
  expect(() => parseHosSettingsInput({ host: 'h', port: 3306, user: 'u', database: 'hos', password: 'p', eligibleItemCodes: "1'" }, none)).toThrow('icode');
});

test('splits item codes on commas, spaces and new lines', () => {
  expect(parseItemCodes('1, 2\n3 2')).toEqual(['1', '2', '3']);
});

test('explains HOSxP driver errors in Thai without leaking details', () => {
  expect(describeHosError({ code: 'ER_ACCESS_DENIED_ERROR', sqlMessage: "Access denied for user 'r'@'1.2.3.4' (using password: YES)" })).toContain('ชื่อผู้ใช้หรือรหัสผ่าน');
  expect(describeHosError({ code: 'ECONNREFUSED' })).toContain('host และ port');
  expect(describeHosError({ code: 'ER_TABLEACCESS_DENIED_ERROR', sqlMessage: 'SELECT command denied for table patient' })).toContain('patient');
  expect(describeHosError(new Error('x'))).toBe('อ่านข้อมูลจาก HOSxP ไม่ได้');
  expect(new HosUnavailableError('x').status).toBe(503);
});
