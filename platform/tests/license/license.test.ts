import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { deliveryTierNotice } from '@/license/delivery-tier';
import { installationIdFor, readMachineId } from '@/license/installation';
import { canonicalJson, evaluateLicense, isInstallationId, openWhileLockedPath, parseTokenKey, type License } from '@/license/license';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const installationId = installationIdFor('secret-a', 'machine-a');

const yearly: License = {
  keyId: 'HRL-2569-0001', product: 'health-rider', licensee: { name: 'โรงพยาบาลตัวอย่าง' }, installationId,
  plan: 'yearly', issuedAt: '2026-11-01', expiresAt: '2027-10-31', maxRiders: 20, maxDeliveriesPerMonth: null,
};
const lifetime: License = { ...yearly, keyId: 'HRL-2569-0002', plan: 'lifetime', expiresAt: null };
const monthly: License = { ...yearly, keyId: 'HRL-2569-0003', plan: 'monthly', expiresAt: '2026-11-30' };

function token(body: object, key = privateKey) {
  const payload = Buffer.from(canonicalJson({ v: 1, ...body }));
  return `HR1.${payload.toString('base64url')}.${sign(null, payload, key).toString('base64url')}`;
}

const expect_ = { publicKeyBase64: publicBase64, installationId, revokedKeyIds: [] as string[] };

function state(license: License | null, today: string, clockBack = false) {
  return evaluateLicense({ publicKeyConfigured: true, parsed: license ? { license, problem: null } : null, today, clockBack });
}

describe('installation ID', () => {
  test('is stable for one database and machine, and changes with either', () => {
    expect(isInstallationId(installationId)).toBe(true);
    expect(installationIdFor('secret-a', 'machine-a')).toBe(installationId);
    expect(installationIdFor('secret-b', 'machine-a')).not.toBe(installationId);
    expect(installationIdFor('secret-a', 'machine-b')).not.toBe(installationId);
  });

  test('reads the first machine ID file that has one, else nothing', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hr-machine-'));
    writeFileSync(path.join(dir, 'b'), 'abc123\n');
    expect(await readMachineId([path.join(dir, 'missing'), path.join(dir, 'b')])).toBe('abc123');
    expect(await readMachineId([path.join(dir, 'missing')])).toBe('');
  });
});

describe('token key', () => {
  test('a key signed by the vendor for this machine is accepted, spaces and line breaks included', () => {
    const key = token(yearly);
    expect(parseTokenKey(` ${key.slice(0, 40)}\n${key.slice(40)} `, expect_)).toEqual({ license: yearly, problem: null });
  });

  test('a changed payload, another signing key or a broken format is refused', () => {
    const [prefix, , signature] = token(yearly).split('.');
    const forged = Buffer.from(canonicalJson({ v: 1, ...yearly, expiresAt: '2099-12-31' })).toString('base64url');
    expect(parseTokenKey(`${prefix}.${forged}.${signature}`, expect_).problem).toMatch(/ไม่ได้ออกโดยผู้พัฒนา/);
    expect(parseTokenKey(token(yearly, generateKeyPairSync('ed25519').privateKey), expect_).license).toBeNull();
    expect(parseTokenKey('not a key', expect_).problem).toMatch(/รูปแบบ/);
  });

  test('a key for another machine or a revoked key is refused', () => {
    expect(parseTokenKey(token({ ...yearly, installationId: installationIdFor('x', 'y') }), expect_).problem).toMatch(/ไม่ใช่เครื่องนี้/);
    expect(parseTokenKey(token(yearly), { ...expect_, revokedKeyIds: ['HRL-2569-0001'] }).problem).toMatch(/ถูกยกเลิก/);
  });

  test('a signed key with the wrong shape is refused', () => {
    expect(parseTokenKey(token({ ...yearly, expiresAt: null }), expect_).license).toBeNull();
    expect(parseTokenKey(token({ ...lifetime, expiresAt: '2030-01-01' }), expect_).license).toBeNull();
    expect(parseTokenKey(token({ ...yearly, plan: 'weekly' }), expect_).license).toBeNull();
  });

  test('keys from the vendor tool open the app, renewals run on from the old end', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hr-license-'));
    const tool = path.resolve(__dirname, '../../../license-tool/hr-license.mjs');
    const run = (...args: string[]) => execFileSync(process.execPath, [tool, ...args, '--dir', dir], { encoding: 'utf8' });
    run('keygen');
    const key = readFileSync(path.join(dir, 'public-key.txt'), 'utf8').trim();
    const issued = run('issue', '--name', 'โรงพยาบาลตัวอย่าง', '--installation', installationId, '--plan', 'monthly', '--start', '2026-01-31', '--max-riders', '15');
    const first = parseTokenKey(issued.trim().split('\n').at(-1) ?? '', { ...expect_, publicKeyBase64: key });
    expect(first.license).toMatchObject({ plan: 'monthly', expiresAt: '2026-02-27', maxRiders: 15, maxDeliveriesPerMonth: null });
    expect(parseTokenKey(issued.trim().split('\n').at(-1) ?? '', expect_).license).toBeNull();

    const lifetimeKey = run('renew', installationId, '--plan', 'lifetime').trim().split('\n').at(-1) ?? '';
    expect(parseTokenKey(lifetimeKey, { ...expect_, publicKeyBase64: key }).license).toMatchObject({ plan: 'lifetime', expiresAt: null, maxRiders: 15 });
    const firstKeyId = /HRL-\d{4}-\d{4}/.exec(issued)?.[0] ?? '';
    expect(run('revoke', firstKeyId)).toMatch(/revokedKeyIds/);
    expect(run('list')).toMatch(/ตลอดชีพ/);
  });
});

describe('what the license allows', () => {
  test('without a compiled-in key there are no checks', () => {
    expect(evaluateLicense({ publicKeyConfigured: false, parsed: null, today: '2030-01-01', clockBack: false })).toMatchObject({ status: 'unconfigured', locked: false });
  });

  test('a new install is locked until a key is entered, and a bad key keeps it locked', () => {
    expect(state(null, '2026-11-08')).toMatchObject({ status: 'unactivated', locked: true });
    expect(evaluateLicense({ publicKeyConfigured: true, parsed: { license: null, problem: 'x' }, today: '2026-11-08', clockBack: false })).toMatchObject({ status: 'invalid', locked: true });
  });

  test('a yearly key warns 30 days ahead, gives 7 days of grace, then locks', () => {
    expect(state(yearly, '2027-01-01')).toMatchObject({ status: 'active', locked: false, message: null });
    expect(state(yearly, '2027-10-11').message).toMatch(/อีก 20 วัน/);
    expect(state(yearly, '2027-11-07')).toMatchObject({ status: 'grace', locked: false });
    expect(state(yearly, '2027-11-08')).toMatchObject({ status: 'expired', locked: true });
  });

  test('a monthly key warns a week ahead; a lifetime key never ends', () => {
    expect(state(monthly, '2026-11-22').message).toBeNull();
    expect(state(monthly, '2026-11-23').message).toMatch(/อีก 7 วัน/);
    expect(state(lifetime, '2099-01-01')).toMatchObject({ status: 'active', locked: false, message: null });
  });

  test('a server clock set back locks the app', () => {
    expect(state(lifetime, '2026-11-08', true)).toMatchObject({ status: 'clockBack', locked: true });
  });
});

test('a locked app still answers its version, the lock screen, sign-out and deliveries already made', () => {
  for (const pathname of ['/api/version', '/api/license', '/api/auth/logout', '/api/rider/sync-events', '/api/rider/attempts/abc/evidence']) {
    expect(openWhileLockedPath(pathname)).toBe(true);
  }
  for (const pathname of ['/api/auth/login', '/api/admin/license', '/api/reports/delivery', '/api/pharmacy/candidates']) {
    expect(openWhileLockedPath(pathname)).toBe(false);
  }
});

test('going over the monthly delivery figure only warns', () => {
  const tiered = { ...yearly, maxDeliveriesPerMonth: 500 };
  expect(deliveryTierNotice(tiered, 500)).toBeNull();
  expect(deliveryTierNotice(tiered, 501)).toMatch(/เกินขั้นของ license/);
  expect(deliveryTierNotice(lifetime, 5000)).toBeNull();
});
