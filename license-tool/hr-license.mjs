#!/usr/bin/env node
// Vendor back office for Health Rider token keys: makes the signing key, issues, renews and revokes keys, and
// lists customers by expiry, from the command line or a page on this computer (`serve`). Plain Node 22, no
// packages. The private key and the ledger live in the key folder (default ~/.health-rider-license), never in
// the repo.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

// Must match canonicalJson in platform/src/license/license.ts byte for byte.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const plans = { monthly: 'รายเดือน', yearly: 'รายปี', lifetime: 'ตลอดชีพ' };
const installationPattern = /^HR-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

const bangkokToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
function addMonths(date, months) {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  // 31 Jan plus a month is the last day of February, not 3 March.
  const last = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString().slice(0, 10);
}
const daysUntil = (date) => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${bangkokToday()}T00:00:00Z`)) / 86_400_000);

class ToolError extends Error {}
const fail = (message) => { throw new ToolError(message); };

function paths(dir) {
  const root = path.resolve(dir ?? process.env.HR_LICENSE_DIR ?? path.join(homedir(), '.health-rider-license'));
  return { root, privateKey: path.join(root, 'private-key.pem'), publicKey: path.join(root, 'public-key.txt'), ledger: path.join(root, 'ledger.json') };
}

function readLedger(files) {
  return existsSync(files.ledger) ? JSON.parse(readFileSync(files.ledger, 'utf8')) : [];
}

function writeLedger(files, ledger) {
  writeFileSync(files.ledger, `${JSON.stringify(ledger, null, 2)}\n`, { mode: 0o600 });
}

function keygen(files) {
  if (existsSync(files.privateKey)) fail(`มี private key อยู่แล้วที่ ${files.privateKey} ห้ามสร้างทับ เพราะ key ที่ออกไปแล้วจะใช้ไม่ได้`);
  mkdirSync(files.root, { recursive: true, mode: 0o700 });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  writeFileSync(files.privateKey, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writeFileSync(files.publicKey, `${publicBase64}\n`);
  writeLedger(files, []);
  return { root: files.root, publicKey: publicBase64 };
}

function tokenFor(files, body) {
  if (!existsSync(files.privateKey)) fail(`ไม่พบ private key ที่ ${files.privateKey} รัน keygen ก่อน`);
  const payload = Buffer.from(canonicalJson(body));
  const signature = sign(null, payload, createPrivateKey(readFileSync(files.privateKey)));
  return `HR1.${payload.toString('base64url')}.${signature.toString('base64url')}`;
}

function endFor(plan, start) {
  if (plan === 'monthly') return addDays(addMonths(start, 1), -1);
  if (plan === 'yearly') return addDays(addMonths(start, 12), -1);
  return null;
}

function parseLimit(value, label) {
  if (value === undefined || value === null || value === '' || value === 'unlimited') return null;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) fail(`${label} ต้องเป็นจำนวนเต็มบวก หรือเว้นว่างถ้าไม่จำกัด`);
  return limit;
}

function record(files, ledger, body) {
  const token = tokenFor(files, body);
  const { v: _v, product: _product, ...entry } = body;
  ledger.push({ ...entry, token, revoked: false });
  writeLedger(files, ledger);
  return { ...entry, token };
}

function nextKeyId(ledger) {
  const year = Number(bangkokToday().slice(0, 4)) + 543;
  const count = ledger.filter((entry) => entry.keyId.startsWith(`HRL-${year}-`)).length + 1;
  return `HRL-${year}-${String(count).padStart(4, '0')}`;
}

export function issue(files, { name, installationId, plan, start, maxRiders, maxDeliveries }) {
  if (!plans[plan]) fail('ประเภทต้องเป็น monthly, yearly หรือ lifetime');
  if (!name?.trim()) fail('ต้องระบุชื่อหน่วยงาน');
  const id = String(installationId ?? '').trim().toUpperCase();
  if (!installationPattern.test(id)) fail('รหัสเครื่องต้องเป็นรูปแบบ HR-XXXX-XXXX-XXXX ตามที่หน้าจอล็อกแสดง');
  const ledger = readLedger(files);
  const from = start || bangkokToday();
  return record(files, ledger, {
    v: 1, product: 'health-rider', keyId: nextKeyId(ledger), licensee: { name: name.trim() }, installationId: id, plan,
    issuedAt: bangkokToday(), expiresAt: endFor(plan, from),
    maxRiders: parseLimit(maxRiders, 'จำนวนไรเดอร์'), maxDeliveriesPerMonth: parseLimit(maxDeliveries, 'งานส่งต่อเดือน'),
  });
}

// A renewal runs on from the day after the current key ends, so renewing early never loses days.
export function renew(files, installationId, { plan, maxRiders, maxDeliveries } = {}) {
  const ledger = readLedger(files);
  const last = ledger.filter((entry) => entry.installationId === String(installationId).trim().toUpperCase() && !entry.revoked).at(-1);
  if (!last) fail(`ไม่พบ key ที่ใช้งานอยู่ของเครื่อง ${installationId}`);
  const nextPlan = plan || last.plan;
  if (!plans[nextPlan]) fail('ประเภทต้องเป็น monthly, yearly หรือ lifetime');
  const start = !last.expiresAt || last.expiresAt < bangkokToday() ? bangkokToday() : addDays(last.expiresAt, 1);
  return record(files, ledger, {
    v: 1, product: 'health-rider', keyId: nextKeyId(ledger), licensee: last.licensee, installationId: last.installationId, plan: nextPlan,
    issuedAt: bangkokToday(), expiresAt: endFor(nextPlan, start),
    maxRiders: maxRiders === undefined ? last.maxRiders : parseLimit(maxRiders, 'จำนวนไรเดอร์'),
    maxDeliveriesPerMonth: maxDeliveries === undefined ? last.maxDeliveriesPerMonth : parseLimit(maxDeliveries, 'งานส่งต่อเดือน'),
  });
}

export function revoke(files, keyId) {
  const ledger = readLedger(files);
  const entry = ledger.find((item) => item.keyId === keyId);
  if (!entry) fail(`ไม่พบ key ${keyId}`);
  entry.revoked = true;
  writeLedger(files, ledger);
  const revoked = ledger.filter((item) => item.revoked).map((item) => item.keyId);
  return { keyId, line: `export const revokedKeyIds: readonly string[] = ${JSON.stringify(revoked).replaceAll('"', "'").replaceAll(',', ', ')};` };
}

// One row per installation, its latest key, sorted so the first to run out comes first.
export function customers(files) {
  const latest = new Map();
  for (const entry of readLedger(files)) if (!entry.revoked) latest.set(entry.installationId, entry);
  return [...latest.values()]
    .map((entry) => ({ ...entry, daysLeft: entry.expiresAt ? daysUntil(entry.expiresAt) : null }))
    .sort((left, right) => (left.daysLeft ?? Infinity) - (right.daysLeft ?? Infinity));
}

function check(files, token) {
  const [prefix, payload, signature] = token.trim().split('.');
  const publicKey = createPublicKey({ key: Buffer.from(readFileSync(files.publicKey, 'utf8').trim(), 'base64'), format: 'der', type: 'spki' });
  const ok = prefix === 'HR1' && !!payload && !!signature && verify(null, Buffer.from(payload, 'base64url'), publicKey, Buffer.from(signature, 'base64url'));
  if (!ok) fail('ไม่ถูกต้อง: ลายเซ็นไม่ตรงกับกุญแจนี้ หรือ key ถูกแก้ไข');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

function printKey(entry) {
  console.log(`ออก key ${entry.keyId} ให้ ${entry.licensee.name}`);
  console.log(`  เครื่อง: ${entry.installationId} · ประเภท: ${plans[entry.plan]} · ใช้ได้ถึง: ${entry.expiresAt ?? 'ตลอดชีพ'}`);
  console.log(`  ไรเดอร์: ${entry.maxRiders ?? 'ไม่จำกัด'} · งานส่งต่อเดือน: ${entry.maxDeliveriesPerMonth ?? 'ไม่จำกัด'}`);
  console.log('\nส่ง token key นี้ให้หน่วยงาน (ทั้งบรรทัด):');
  console.log(entry.token);
}

function page(csrf) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>จัดการ token key</title>
<style>body{font-family:Tahoma,'Noto Sans Thai',sans-serif;margin:0;background:#eef3f7;color:#13283a}main{max-width:1100px;margin:0 auto;padding:24px 16px}
section{background:#fff;border-radius:12px;padding:16px 20px;margin:0 0 16px;box-shadow:0 1px 4px rgba(0,0,0,.06)}h1{margin:0 0 16px}h2{margin:0 0 12px;font-size:1.1rem}
form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;align-items:end}label{display:grid;gap:4px;font-size:.9rem}
input,select{font:inherit;padding:8px;border:1px solid #cfd8e0;border-radius:8px}button{font:inherit;padding:9px 14px;border:0;border-radius:8px;background:#007f8b;color:#fff;cursor:pointer}
button.secondary{background:#e3f4f5;color:#006771}button.danger{background:#fde8e6;color:#b42318}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:8px;border-bottom:1px solid #e5ebf0;vertical-align:top}
code{font-family:ui-monospace,monospace}.soon{color:#b45309;font-weight:700}.over{color:#b42318;font-weight:700}#result{white-space:pre-wrap;word-break:break-all}.actions{display:flex;gap:6px;flex-wrap:wrap}</style></head>
<body><main><h1>จัดการ token key ภูไทไรเดอร์</h1>
<section><h2>ออก key ใหม่</h2><form id="issue">
<label>ชื่อหน่วยงาน<input name="name" required></label><label>รหัสเครื่อง<input name="installationId" placeholder="HR-XXXX-XXXX-XXXX" required></label>
<label>ประเภท<select name="plan"><option value="monthly">รายเดือน</option><option value="yearly" selected>รายปี</option><option value="lifetime">ตลอดชีพ</option></select></label>
<label>เริ่มวันที่<input name="start" type="date"></label><label>ไรเดอร์สูงสุด (ว่าง = ไม่จำกัด)<input name="maxRiders" type="number" min="1"></label>
<label>งานส่งต่อเดือน (ว่าง = ไม่จำกัด)<input name="maxDeliveries" type="number" min="1"></label><button>ออก key</button></form></section>
<section><h2>Token key ล่าสุด</h2><p id="result">ยังไม่ได้ออก key ในรอบนี้</p><button class="secondary" id="copy" hidden>คัดลอก key</button></section>
<section><h2>ลูกค้า</h2><table><thead><tr><th>หน่วยงาน</th><th>รหัสเครื่อง</th><th>เลขที่ key</th><th>ประเภท</th><th>ใช้ได้ถึง</th><th>เหลือ</th><th>ไรเดอร์</th><th></th></tr></thead><tbody id="rows"></tbody></table></section>
</main><script>
const csrf=${JSON.stringify(csrf)};const plans=${JSON.stringify(plans)};let last='';
const esc=(v)=>String(v??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
async function call(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-csrf':csrf},body:body?JSON.stringify(body):undefined});const j=await r.json();if(!r.ok)throw new Error(j.message);return j;}
function show(entry){last=entry.token;document.getElementById('result').textContent=entry.keyId+' · '+entry.licensee.name+' · '+plans[entry.plan]+' · ใช้ได้ถึง '+(entry.expiresAt??'ตลอดชีพ')+'\\n\\n'+entry.token;document.getElementById('copy').hidden=false;}
async function load(){const {rows}=await call('/api/customers');document.getElementById('rows').innerHTML=rows.map((r)=>'<tr><td>'+esc(r.licensee.name)+'</td><td><code>'+esc(r.installationId)+'</code></td><td><code>'+esc(r.keyId)+'</code></td><td>'+esc(plans[r.plan])+'</td><td>'+esc(r.expiresAt??'ตลอดชีพ')+'</td><td class="'+(r.daysLeft!==null&&r.daysLeft<0?'over':r.daysLeft!==null&&r.daysLeft<=30?'soon':'')+'">'+(r.daysLeft===null?'-':esc(r.daysLeft)+' วัน')+'</td><td>'+esc(r.maxRiders??'ไม่จำกัด')+'</td><td class="actions"><button class="secondary" data-renew="'+esc(r.installationId)+'">ต่ออายุ</button><button class="secondary" data-token="'+esc(r.token)+'">คัดลอก key</button><button class="danger" data-revoke="'+esc(r.keyId)+'">ยกเลิก</button></td></tr>').join('')||'<tr><td colspan="8">ยังไม่มีลูกค้า</td></tr>';}
document.getElementById('issue').addEventListener('submit',async(e)=>{e.preventDefault();try{show(await call('/api/issue',Object.fromEntries(new FormData(e.target))));e.target.reset();await load();}catch(err){alert(err.message);}});
document.getElementById('copy').addEventListener('click',()=>navigator.clipboard.writeText(last));
document.getElementById('rows').addEventListener('click',async(e)=>{const b=e.target.closest('button');if(!b)return;try{
if(b.dataset.token)return navigator.clipboard.writeText(b.dataset.token);
if(b.dataset.renew){const plan=prompt('ต่ออายุเป็นประเภทใด (monthly, yearly, lifetime) เว้นว่าง = ประเภทเดิม','');if(plan===null)return;show(await call('/api/renew',{installationId:b.dataset.renew,plan:plan||undefined}));}
if(b.dataset.revoke){if(!confirm('ยกเลิก key '+b.dataset.revoke+' ?'))return;const r=await call('/api/revoke',{keyId:b.dataset.revoke});alert('ยกเลิกแล้ว ใส่บรรทัดนี้ใน platform/src/license/revoked.ts แล้วออกเวอร์ชันใหม่\\n\\n'+r.line);}
await load();}catch(err){alert(err.message);}});
load();
</script></body></html>`;
}

function serve(files, port) {
  if (!existsSync(files.privateKey)) fail(`ไม่พบ private key ที่ ${files.privateKey} รัน keygen ก่อน`);
  const csrf = randomBytes(24).toString('hex');
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const server = createServer(async (request, response) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-frame-options': 'DENY' });
      response.end(typeof body === 'string' ? body : JSON.stringify(body));
    };
    // Only this computer's own browser, on this exact address: refuses other hosts and DNS rebinding.
    if (!hosts.has(request.headers.host ?? '')) return send(403, { message: 'forbidden' });
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    if (request.method === 'GET' && url.pathname === '/') return send(200, page(csrf), 'text/html; charset=utf-8');
    if (request.headers['x-csrf'] !== csrf) return send(403, { message: 'เปิดหน้านี้ใหม่แล้วลองอีกครั้ง' });
    try {
      if (request.method === 'GET' && url.pathname === '/api/customers') return send(200, { rows: customers(files) });
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (request.method === 'POST' && url.pathname === '/api/issue') return send(200, issue(files, body));
      if (request.method === 'POST' && url.pathname === '/api/renew') return send(200, renew(files, body.installationId, { plan: body.plan }));
      if (request.method === 'POST' && url.pathname === '/api/revoke') return send(200, revoke(files, body.keyId));
      return send(404, { message: 'ไม่พบ' });
    } catch (error) {
      return send(error instanceof ToolError ? 422 : 500, { message: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`เปิด http://127.0.0.1:${port} ในเบราว์เซอร์ของเครื่องนี้ (กด Ctrl+C เพื่อปิด)`));
}

const usage = `ใช้งาน: node license-tool/hr-license.mjs <คำสั่ง> [ตัวเลือก]

  keygen                         สร้างกุญแจ (ครั้งเดียว)
  serve  [--port 4800]           เปิดหน้าจัดการ key ในเบราว์เซอร์ของเครื่องนี้
  issue  --name "โรงพยาบาล..." --installation HR-XXXX-XXXX-XXXX --plan monthly|yearly|lifetime
         [--start YYYY-MM-DD] [--max-riders 30] [--max-deliveries 500]
  renew  <รหัสเครื่อง> [--plan ...] [--max-riders ...] [--max-deliveries ...]
  revoke <เลขที่ key>
  list                           แสดงลูกค้าเรียงตามวันหมดอายุ
  verify <token key>

ทุกคำสั่งรับ --dir <โฟลเดอร์กุญแจ> (ค่าเริ่มต้น ~/.health-rider-license หรือ HR_LICENSE_DIR)`;

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      dir: { type: 'string' }, name: { type: 'string' }, installation: { type: 'string' }, plan: { type: 'string' }, start: { type: 'string' },
      'max-riders': { type: 'string' }, 'max-deliveries': { type: 'string' }, port: { type: 'string' },
    },
  });
  const files = paths(values.dir);
  const [command, argument] = positionals;
  const limits = { maxRiders: values['max-riders'], maxDeliveries: values['max-deliveries'] };
  if (command === 'keygen') {
    const made = keygen(files);
    console.log(`สร้างกุญแจแล้วที่ ${made.root}`);
    console.log('สำรองโฟลเดอร์นี้ไว้อย่างน้อย 2 ที่ ถ้า private key หาย จะออกหรือต่อ key ให้ลูกค้าเดิมไม่ได้');
    console.log('\nใส่ public key นี้ใน platform/src/license/public-key.ts แล้วออกเวอร์ชันใหม่:');
    return console.log(`export const licensePublicKey = '${made.publicKey}';`);
  }
  if (command === 'serve') return serve(files, Number(values.port ?? 4800));
  if (command === 'issue') return printKey(issue(files, { name: values.name, installationId: values.installation, plan: values.plan, start: values.start, ...limits }));
  if (command === 'renew') return argument ? printKey(renew(files, argument, { plan: values.plan, ...limits })) : fail('ระบุรหัสเครื่อง');
  if (command === 'revoke') {
    if (!argument) fail('ระบุเลขที่ key');
    const { keyId, line } = revoke(files, argument);
    console.log(`ยกเลิก ${keyId} แล้ว ใส่บรรทัดนี้ใน platform/src/license/revoked.ts แล้วออกเวอร์ชันใหม่:\n${line}`);
    return;
  }
  if (command === 'list') {
    const rows = customers(files);
    if (rows.length === 0) return console.log('ยังไม่มีลูกค้า');
    for (const row of rows) {
      const flag = row.daysLeft === null ? '' : row.daysLeft < 0 ? '  ← หมดแล้ว' : row.daysLeft <= 30 ? '  ← ใกล้หมด' : '';
      console.log(`${row.keyId}\t${row.licensee.name}\t${row.installationId}\t${plans[row.plan]}\t${row.expiresAt ?? 'ตลอดชีพ'}\tไรเดอร์ ${row.maxRiders ?? 'ไม่จำกัด'}${flag}`);
    }
    return;
  }
  if (command === 'verify') {
    if (!argument) fail('ระบุ token key');
    const body = check(files, argument);
    return console.log(`ถูกต้อง: ${body.keyId} ของ ${body.licensee?.name} เครื่อง ${body.installationId}`);
  }
  console.log(usage);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (error) {
    if (!(error instanceof ToolError)) throw error;
    console.error(`ผิดพลาด: ${error.message}`);
    process.exit(1);
  }
}
