import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { canonicalJson, evaluateLicense, parseSignedLicense, requestNeedsWritableLicense, type License } from '@/license/license';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const perpetual: License = {
  licenseId: 'HR-2026-0001', product: 'health-rider',
  licensee: { name: 'โรงพยาบาลตัวอย่าง', hcode: '10999', province: 'สกลนคร' },
  type: 'perpetual', issuedAt: '2026-10-01', expiresAt: null, updatesUntil: '2027-09-30', maxRiders: 20,
};
const subscription: License = { ...perpetual, licenseId: 'HR-2026-0002', type: 'subscription', expiresAt: '2027-09-30' };

function signed(body: object, key = privateKey) {
  return JSON.stringify({ ...body, signature: sign(null, Buffer.from(canonicalJson(body)), key).toString('base64') }, null, 2);
}

function state(license: License | null, today: string, buildDate: string | null = '2026-10-17') {
  return evaluateLicense({ publicKeyConfigured: true, parsed: license ? { license, problem: null } : null, today, installedAt: '2026-10-17', buildDate });
}

describe('license file', () => {
  test('a file signed with the vendor key is accepted whatever its key order or spacing', () => {
    const reordered = JSON.parse(signed(perpetual));
    const text = JSON.stringify({ signature: reordered.signature, type: reordered.type, ...reordered });
    expect(parseSignedLicense(text, publicBase64)).toEqual({ license: perpetual, problem: null });
  });

  test('a changed field, another key or a missing signature is refused', () => {
    const tampered = JSON.parse(signed(perpetual));
    tampered.maxRiders = 999;
    expect(parseSignedLicense(JSON.stringify(tampered), publicBase64).license).toBeNull();
    const other = generateKeyPairSync('ed25519').privateKey;
    expect(parseSignedLicense(signed(perpetual, other), publicBase64).problem).toMatch(/ลายมือชื่อดิจิทัลไม่ถูกต้อง/);
    expect(parseSignedLicense(JSON.stringify(perpetual), publicBase64).problem).toMatch(/ไม่มีลายมือชื่อ/);
    expect(parseSignedLicense('not json', publicBase64).problem).toMatch(/JSON/);
  });

  test('a signed file with the wrong shape is refused', () => {
    expect(parseSignedLicense(signed({ ...subscription, expiresAt: null }), publicBase64).license).toBeNull();
    expect(parseSignedLicense(signed({ ...perpetual, product: 'other' }), publicBase64).license).toBeNull();
  });

  test('files from the vendor tool pass the app check', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hr-license-'));
    const tool = path.resolve(__dirname, '../../../license-tool/hr-license.mjs');
    execFileSync(process.execPath, [tool, 'keygen', '--dir', dir]);
    execFileSync(process.execPath, [tool, 'issue', '--dir', dir, '--type', 'subscription', '--name', 'โรงพยาบาลตัวอย่าง', '--hcode', '10999', '--province', 'สกลนคร', '--start', '2026-11-01', '--max-riders', '15']);
    const key = readFileSync(path.join(dir, 'public-key.txt'), 'utf8').trim();
    const text = readFileSync(path.join(dir, 'issued', 'HR-2026-0001-r1.json'), 'utf8');
    expect(parseSignedLicense(text, key).license).toMatchObject({ type: 'subscription', expiresAt: '2027-10-31', updatesUntil: '2027-10-31', maxRiders: 15 });
    expect(parseSignedLicense(text, publicBase64).license).toBeNull();
  });
});

describe('what the license allows', () => {
  test('without a compiled-in key there are no checks', () => {
    expect(evaluateLicense({ publicKeyConfigured: false, parsed: null, today: '2030-01-01', installedAt: '', buildDate: null })).toMatchObject({ status: 'unconfigured', writable: true });
  });

  test('a new install runs for 30 days without a license, then turns read-only', () => {
    expect(state(null, '2026-11-16')).toMatchObject({ status: 'trial', writable: true });
    expect(state(null, '2026-11-17')).toMatchObject({ status: 'unlicensed', writable: false });
  });

  test('a subscription warns 60 days ahead, has 30 days of grace, then turns read-only', () => {
    expect(state(subscription, '2027-01-01')).toMatchObject({ status: 'active', writable: true, message: null });
    expect(state(subscription, '2027-08-15').message).toMatch(/อีก 46 วัน/);
    expect(state(subscription, '2027-10-30')).toMatchObject({ status: 'grace', writable: true });
    expect(state(subscription, '2027-10-31')).toMatchObject({ status: 'expired', writable: false });
    expect(state(subscription, '2027-12-01', '2027-11-20')).toMatchObject({ status: 'expired', writable: false });
  });

  test('a perpetual license keeps working after MA ends, but not with a build made after it', () => {
    expect(state(perpetual, '2030-01-01')).toMatchObject({ status: 'active', writable: true });
    expect(state(perpetual, '2030-01-01').message).toMatch(/MA/);
    expect(state(perpetual, '2027-10-05', '2027-10-01')).toMatchObject({ status: 'updatesExpired', writable: false });
  });
});

test('read-only mode still lets people sign in, install a license and sync deliveries already made', () => {
  expect(requestNeedsWritableLicense('GET', '/api/reports/delivery')).toBe(false);
  expect(requestNeedsWritableLicense('POST', '/api/pharmacy/candidates/confirm')).toBe(true);
  expect(requestNeedsWritableLicense('PATCH', '/api/admin/users/abc')).toBe(true);
  for (const pathname of ['/api/auth/login', '/api/auth/logout', '/api/admin/license', '/api/rider/sync-events', '/api/rider/attempts/abc/evidence', '/api/me/password']) {
    expect(requestNeedsWritableLicense('POST', pathname)).toBe(false);
  }
});
