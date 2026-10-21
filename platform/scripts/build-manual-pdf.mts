// Builds public/manual/health-rider-user-manual.pdf from src/help/manual.ts, so the PDF and the /help page say the
// same thing. Run `npm run manual:pdf` after editing the manual; it needs network for Google Fonts and a Chromium
// (PLAYWRIGHT_CHROMIUM_PATH, or Playwright's own). It also records the manual's hash, which a unit test checks.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { manual, manualUpdated } from '../src/help/manual.ts';

const root = new URL('..', import.meta.url).pathname;
const out = `${root}public/manual/`;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const rich = (s: string) => esc(s).split('**').map((p, i) => (i % 2 ? `<b class="ui">${p}</b>` : p)).join('');
const roleNames: Record<string, string> = { pharmacy: 'เภสัชกรรม', coordinator: 'ผู้ประสานงาน', rider: 'ไรเดอร์', admin: 'ผู้ดูแลระบบ', auditor: 'ผู้ตรวจสอบ' };
const block = (b: any): string => {
  switch (b.kind) {
    case 'p': return `<p>${rich(b.text)}</p>`;
    case 'note': return `<div class="note"><span class="note-tag">ข้อควรรู้</span><p>${rich(b.text)}</p></div>`;
    case 'steps': return `<ol class="steps">${b.items.map((t: string) => `<li><p>${rich(t)}</p></li>`).join('')}</ol>`;
    case 'list': return `<ul class="bullets">${b.items.map((t: string) => `<li>${rich(t)}</li>`).join('')}</ul>`;
    case 'table': return `<table><thead><tr>${b.head.map((h: string) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.rows.map((r: string[]) => `<tr>${r.map((c) => `<td>${rich(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  return '';
};
const mascot = `data:image/png;base64,${readFileSync(`${root}public/brand/mascot.png`).toString('base64')}`;
const sections = manual.map((s, i) => `
<section class="chapter" id="${s.id}">
  <header class="chapter-head">
    <span class="num">${String(i + 1).padStart(2, '0')}</span>
    <div><h1>${esc(s.title)}</h1>${s.roles ? `<div class="roles">${s.roles.map((r) => `<span>${roleNames[r]}</span>`).join('')}</div>` : ''}</div>
  </header>
  ${s.blocks.map(block).join('')}
  ${(s.parts ?? []).map((p, j) => `<div class="part"><h2><span>${i + 1}.${j + 1}</span>${esc(p.title)}</h2>${p.blocks.map(block).join('')}</div>`).join('')}
</section>`).join('');
const toc = manual.map((s, i) => `<li><a href="#${s.id}"><span class="tn">${String(i + 1).padStart(2, '0')}</span><span class="tt">${esc(s.title)}</span></a>${s.parts ? `<div class="tp">${s.parts.map((p) => esc(p.title)).join(' · ')}</div>` : ''}</li>`).join('');

const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700&family=Prompt:wght@500;600;700&display=swap" rel="stylesheet">
<style>
@page { size: A4; margin: 18mm 16mm 20mm; }
@page :first { margin: 0; }
:root { --teal:#007f8b; --teal-dark:#005f68; --navy:#1e2a48; --soft:#e6f4f5; --line:#d5e0e6; --muted:#5a6782; --amber:#b45309; }
* { box-sizing: border-box; }
body { margin:0; font-family:'Noto Sans Thai', sans-serif; font-size:10.5pt; line-height:1.65; color:#1f2937; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
h1,h2,.cover-title,.num,.tn { font-family:'Prompt','Noto Sans Thai',sans-serif; }
.cover { height:297mm; width:210mm; position:relative; overflow:hidden; background:linear-gradient(150deg,var(--navy) 0%,#1d4a66 55%,var(--teal) 100%); color:#fff; page-break-after:always; padding:30mm 22mm; }
.cover::before { content:''; position:absolute; width:150mm; height:150mm; border-radius:50%; background:rgba(255,255,255,.06); right:-40mm; top:-40mm; }
.cover::after { content:''; position:absolute; width:110mm; height:110mm; border-radius:50%; background:rgba(255,255,255,.05); left:-35mm; bottom:-30mm; }
.brand { display:flex; align-items:center; gap:10px; font-weight:600; letter-spacing:.3px; opacity:.95; }
.brand i { width:30px; height:30px; border-radius:8px; background:#fff; display:inline-block; position:relative; }
.brand i::after { content:'+'; position:absolute; inset:0; color:var(--teal); font:700 22px/30px Prompt; text-align:center; font-style:normal; }
.cover-kicker { margin-top:34mm; font-size:13pt; color:#9fe3e8; font-weight:500; }
.cover-title { font-size:36pt; line-height:1.2; font-weight:700; margin:4mm 0 6mm; }
.cover-sub { font-size:13pt; max-width:120mm; opacity:.9; }
.cover img { position:absolute; right:14mm; bottom:34mm; width:100mm; z-index:1; }
.cover-meta { position:absolute; left:22mm; bottom:24mm; font-size:10.5pt; opacity:.85; z-index:1; }
.cover-meta b { display:block; font-size:12pt; opacity:1; }
.toc { page-break-after:always; }
.toc h1 { font-size:22pt; color:var(--navy); margin:0 0 8mm; border-bottom:3px solid var(--teal); padding-bottom:3mm; }
.toc ol { list-style:none; padding:0; margin:0; }
.toc li { padding:3.2mm 0; border-bottom:1px dashed var(--line); }
.toc a { color:inherit; text-decoration:none; display:flex; gap:5mm; align-items:baseline; }
.tn { color:var(--teal); font-weight:700; font-size:15pt; min-width:11mm; }
.tt { font-size:13pt; font-weight:600; color:var(--navy); }
.tp { margin-left:16mm; color:var(--muted); font-size:9.5pt; }
.chapter { page-break-before:always; }
.chapter-head { display:flex; align-items:center; gap:5mm; background:linear-gradient(120deg,var(--navy),var(--teal)); color:#fff; border-radius:10px; padding:5mm 7mm; margin-bottom:6mm; }
.chapter-head .num { font-size:28pt; font-weight:700; color:#9fe3e8; line-height:1; }
.chapter-head h1 { margin:0; font-size:19pt; line-height:1.3; }
.roles { margin-top:1.5mm; display:flex; gap:2mm; flex-wrap:wrap; }
.roles span { background:rgba(255,255,255,.18); border-radius:20px; padding:0 3mm; font-size:8.5pt; }
.part { break-inside:auto; }
h2 { font-size:13.5pt; color:var(--navy); margin:7mm 0 3mm; display:flex; gap:3mm; align-items:center; break-after:avoid; }
h2 span { background:var(--soft); color:var(--teal-dark); border-radius:6px; padding:0 2.2mm; font-size:10.5pt; }
p { margin:0 0 3mm; }
b.ui { color:var(--teal-dark); background:var(--soft); border-radius:4px; padding:0 1.2mm; font-weight:600; }
.steps { list-style:none; counter-reset:s; padding:0; margin:0 0 4mm; }
.steps li { counter-increment:s; position:relative; padding:0 0 2.5mm 11mm; break-inside:avoid; }
.steps li::before { content:counter(s); position:absolute; left:0; top:.3mm; width:7mm; height:7mm; border-radius:50%; background:var(--teal); color:#fff; font:600 9.5pt/7mm Prompt; text-align:center; }
.steps li:not(:last-child)::after { content:''; position:absolute; left:3.4mm; top:8mm; bottom:0; border-left:1.5px solid #b9dde0; }
.steps li p { margin:0; }
.bullets { margin:0 0 4mm; padding-left:6mm; }
.bullets li { margin-bottom:1.5mm; }
.bullets li::marker { color:var(--teal); }
.note { border-left:4px solid var(--amber); background:#fff7ed; border-radius:0 8px 8px 0; padding:2.5mm 4mm; margin:0 0 4mm; break-inside:avoid; }
.note-tag { display:block; font-weight:700; color:var(--amber); font-size:9pt; }
.note p { margin:0; }
table { width:100%; border-collapse:separate; border-spacing:0; margin:2mm 0 5mm; font-size:9.6pt; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
thead { display:table-header-group; }
th { background:var(--navy); color:#fff; text-align:left; padding:2.2mm 3mm; font-weight:600; }
td { padding:2mm 3mm; border-top:1px solid var(--line); vertical-align:top; }
tbody tr:nth-child(even) td { background:#f5f9fa; }
tr { break-inside:avoid; }
td:first-child { font-weight:600; color:var(--navy); }
</style></head><body>
<div class="cover">
  <div class="brand"><i></i> ภูไทไรเดอร์ · โรงพยาบาลวาริชภูมิ</div>
  <div class="cover-kicker">ระบบส่งยาถึงบ้าน</div>
  <div class="cover-title">คู่มือการใช้งาน<br>ภูไทไรเดอร์</div>
  <div class="cover-sub">สำหรับเภสัชกรรม ไรเดอร์ ผู้ประสานงาน และผู้ดูแลระบบ</div>
  <img src="${mascot}" alt="">
  <div class="cover-meta"><b>ฉบับปรับปรุง ${manualUpdated}</b>เปิดอ่านในโปรแกรมได้ที่เมนู คู่มือการใช้งาน</div>
</div>
<div class="toc"><h1>สารบัญ</h1><ol>${toc}</ol></div>
${sections}
</body></html>`;

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {});
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: `${out}health-rider-user-manual.pdf`, format: 'A4', printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="width:100%;font-size:8px;color:#5a6782;padding:0 16mm;display:flex;justify-content:space-between;font-family:sans-serif"><span>ภูไทไรเดอร์ · คู่มือการใช้งาน</span><span class="pageNumber"></span></div>',
});
await browser.close();
writeFileSync(`${out}manual-source.sha256`, `${createHash('sha256').update(readFileSync(`${root}src/help/manual.ts`)).digest('hex')}\n`);
