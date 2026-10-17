#!/usr/bin/env node
// Vendor back office for Health Rider licenses: makes the signing key, issues and renews license files,
// and lists customers by expiry. Runs on the vendor's own computer with plain Node 22, no packages.
// The private key and the ledger live in the key folder (default ~/.health-rider-license), never in the repo.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Must match canonicalJson in platform/src/license/license.ts byte for byte.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const bangkokToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function addYears(date, years) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCFullYear(value.getUTCFullYear() + years);
  return value.toISOString().slice(0, 10);
}
const daysUntil = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${bangkokToday()}T00:00:00Z`)) / 86_400_000);

function fail(message) {
  console.error(`ผิดพลาด: ${message}`);
  process.exit(1);
}

function paths(dir) {
  const root = path.resolve(dir ?? process.env.HR_LICENSE_DIR ?? path.join(homedir(), '.health-rider-license'));
  return { root, privateKey: path.join(root, 'private-key.pem'), publicKey: path.join(root, 'public-key.txt'), ledger: path.join(root, 'ledger.json'), issued: path.join(root, 'issued') };
}

function readLedger(files) {
  return existsSync(files.ledger) ? JSON.parse(readFileSync(files.ledger, 'utf8')) : [];
}

function keygen(files) {
  if (existsSync(files.privateKey)) fail(`มี private key อยู่แล้วที่ ${files.privateKey} ห้ามสร้างทับ เพราะ license ที่ออกไปแล้วจะใช้ไม่ได้`);
  mkdirSync(files.issued, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  writeFileSync(files.privateKey, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(files.publicKey, `${publicBase64}\n`);
  writeFileSync(files.ledger, '[]\n');
  console.log(`สร้างกุญแจแล้วที่ ${files.root}`);
  console.log('สำรองโฟลเดอร์นี้ไว้อย่างน้อย 2 ที่ ถ้า private key หาย จะออกหรือต่อ license ให้ลูกค้าเดิมไม่ได้');
  console.log('\nใส่ public key นี้ใน platform/src/license/public-key.ts แล้ว build image ใหม่:');
  console.log(`export const licensePublicKey = '${publicBase64}';`);
}

function signLicense(files, body) {
  if (!existsSync(files.privateKey)) fail(`ไม่พบ private key ที่ ${files.privateKey} รัน keygen ก่อน`);
  const key = createPrivateKey(readFileSync(files.privateKey));
  return { ...body, signature: sign(null, Buffer.from(canonicalJson(body)), key).toString('base64') };
}

function save(files, ledger, signed, revision) {
  const file = path.join(files.issued, `${signed.licenseId}-r${revision}.json`);
  mkdirSync(files.issued, { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(signed, null, 2)}\n`);
  const { signature: _signature, product: _product, ...entry } = signed;
  ledger.push({ ...entry, revision, file: path.relative(files.root, file) });
  writeFileSync(files.ledger, `${JSON.stringify(ledger, null, 2)}\n`);
  console.log(`ออก license ${signed.licenseId} ครั้งที่ ${revision} ให้ ${signed.licensee.name}`);
  console.log(`  ประเภท: ${signed.type === 'perpetual' ? 'ขายขาด + MA' : 'subscription'}`);
  console.log(`  ใช้งานได้ถึง: ${signed.expiresAt ?? 'ไม่หมดอายุ'} · รับอัปเดตถึง: ${signed.updatesUntil}`);
  console.log(`  ไรเดอร์: ${signed.maxRiders ?? 'ไม่จำกัด'} · งานส่งต่อเดือน: ${signed.maxDeliveriesPerMonth ?? 'ไม่จำกัด'}`);
  console.log(`  ไฟล์ที่ส่งให้ รพ.: ${file}`);
}

function terms(type, start, years) {
  const end = addDays(addYears(start, years), -1);
  return type === 'perpetual' ? { expiresAt: null, updatesUntil: end } : { expiresAt: end, updatesUntil: end };
}

function parseLimit(value, flag) {
  if (value === undefined || value === 'unlimited') return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) fail(`${flag} ต้องเป็นจำนวนเต็มบวก หรือ unlimited`);
  return limit;
}

function issue(files, options) {
  if (options.type !== 'perpetual' && options.type !== 'subscription') fail('--type ต้องเป็น perpetual หรือ subscription');
  if (!options.name || !options.hcode || !options.province) fail('ต้องระบุ --name --hcode --province');
  if (!/^\d{5}$/.test(options.hcode)) fail('--hcode ต้องเป็นรหัสหน่วยบริการ 5 หลัก');
  const ledger = readLedger(files);
  if (ledger.some((entry) => entry.licensee.hcode === options.hcode)) fail(`รหัสหน่วยบริการ ${options.hcode} มี license แล้ว ใช้คำสั่ง renew แทน`);
  const start = options.start ?? bangkokToday();
  const year = start.slice(0, 4);
  const next = ledger.filter((entry) => entry.licenseId.startsWith(`HR-${year}-`)).length + 1;
  const body = {
    licenseId: `HR-${year}-${String(next).padStart(4, '0')}`,
    product: 'health-rider',
    licensee: { name: options.name, hcode: options.hcode, province: options.province },
    type: options.type,
    issuedAt: bangkokToday(),
    ...terms(options.type, start, Number(options.years ?? 1)),
    maxRiders: parseLimit(options['max-riders'], '--max-riders'),
    maxDeliveriesPerMonth: parseLimit(options['max-deliveries'], '--max-deliveries'),
  };
  save(files, ledger, signLicense(files, body), 1);
}

// Extends from the day after the current term ends, so renewing early never loses days.
function renew(files, licenseId, options) {
  const ledger = readLedger(files);
  const history = ledger.filter((entry) => entry.licenseId === licenseId);
  const last = history.at(-1);
  if (!last) fail(`ไม่พบ license ${licenseId}`);
  const type = options.type ?? last.type;
  const previousEnd = last.type === 'perpetual' ? last.updatesUntil : last.expiresAt;
  const start = previousEnd < bangkokToday() ? bangkokToday() : addDays(previousEnd, 1);
  const body = {
    licenseId,
    product: 'health-rider',
    licensee: last.licensee,
    type,
    issuedAt: bangkokToday(),
    ...terms(type, start, Number(options.years ?? 1)),
    maxRiders: options['max-riders'] === undefined ? last.maxRiders : parseLimit(options['max-riders'], '--max-riders'),
    maxDeliveriesPerMonth: options['max-deliveries'] === undefined ? last.maxDeliveriesPerMonth ?? null : parseLimit(options['max-deliveries'], '--max-deliveries'),
  };
  save(files, ledger, signLicense(files, body), history.length + 1);
}

function list(files, options) {
  const latest = new Map();
  for (const entry of readLedger(files)) latest.set(entry.licenseId, entry);
  const soon = Number(options.days ?? 60);
  const rows = [...latest.values()].map((entry) => {
    const end = entry.type === 'perpetual' ? entry.updatesUntil : entry.expiresAt;
    return { ...entry, end, left: daysUntil(end) };
  }).sort((left, right) => left.left - right.left);
  if (rows.length === 0) return console.log('ยังไม่มี license ที่ออกไป');
  console.log('เลขที่\t\tรพ.\t\t\tประเภท\t\tสิ้นสุด\t\tเหลือ (วัน)\tไรเดอร์\tงาน/เดือน');
  for (const row of rows) {
    const flag = row.left < 0 ? '  ← หมดแล้ว' : row.left <= soon ? '  ← ใกล้หมด ติดต่อต่ออายุ' : '';
    console.log(`${row.licenseId}\t${row.licensee.name} (${row.licensee.hcode})\t${row.type === 'perpetual' ? 'ขายขาด+MA' : 'subscription'}\t${row.end}\t${row.left}\t\t${row.maxRiders ?? 'ไม่จำกัด'}\t${row.maxDeliveriesPerMonth ?? 'ไม่จำกัด'}${flag}`);
  }
}

function check(files, file) {
  const { signature, ...body } = JSON.parse(readFileSync(file, 'utf8'));
  const publicKey = createPublicKey({ key: Buffer.from(readFileSync(files.publicKey, 'utf8').trim(), 'base64'), format: 'der', type: 'spki' });
  const ok = typeof signature === 'string' && verify(null, Buffer.from(canonicalJson(body)), publicKey, Buffer.from(signature, 'base64'));
  console.log(ok ? `ถูกต้อง: ${body.licenseId} ของ ${body.licensee?.name}` : 'ไม่ถูกต้อง: ลายมือชื่อไม่ตรงกับกุญแจนี้ หรือไฟล์ถูกแก้ไข');
  if (!ok) process.exit(1);
}

const usage = `ใช้งาน: node license-tool/hr-license.mjs <คำสั่ง> [ตัวเลือก]

  keygen                         สร้างกุญแจ (ครั้งเดียว)
  issue  --type perpetual|subscription --name "โรงพยาบาล..." --hcode 10999 --province "..."
         [--start YYYY-MM-DD] [--years 1] [--max-riders 30|unlimited] [--max-deliveries 500|unlimited]
  renew  <licenseId> [--years 1] [--type ...] [--max-riders ...] [--max-deliveries ...]
  list   [--days 60]                แสดงลูกค้าเรียงตามวันสิ้นสุด
  verify <ไฟล์ license>

ทุกคำสั่งรับ --dir <โฟลเดอร์กุญแจ> (ค่าเริ่มต้น ~/.health-rider-license หรือ HR_LICENSE_DIR)`;

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' }, type: { type: 'string' }, name: { type: 'string' }, hcode: { type: 'string' }, province: { type: 'string' },
      start: { type: 'string' }, years: { type: 'string' }, 'max-riders': { type: 'string' }, 'max-deliveries': { type: 'string' }, days: { type: 'string' },
    },
  });
  const files = paths(values.dir);
  const [command, argument] = positionals;
  if (command === 'keygen') return keygen(files);
  if (command === 'issue') return issue(files, values);
  if (command === 'renew') return argument ? renew(files, argument, values) : fail('ระบุเลขที่ license');
  if (command === 'list') return list(files, values);
  if (command === 'verify') return argument ? check(files, argument) : fail('ระบุไฟล์ license');
  console.log(usage);
}

main();
