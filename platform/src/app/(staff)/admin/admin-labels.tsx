'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ParcelLabel, type PackageLabel } from '@/app/(staff)/pharmacy/packages/package-qr-label';
import {
  labelSizes, pageLayout, paperName, paperSizes, parseLabelLayout, type LabelLayout, type LabelPrint, type LabelSettings, type Paper,
} from '@/domain/settings/label-layout';
import { callApi } from '@/lib/api-client';

// Typed values stay as text until saved, so a half-typed number does not jump around.
type Draft = Record<Exclude<keyof LabelLayout, 'paper' | 'orientation'>, string> & Pick<LabelLayout, 'paper' | 'orientation'>;

const prints: Array<{ key: LabelPrint; title: string; hint: string }> = [
  { key: 'single', title: 'พิมพ์ฉลากเดียว', hint: 'ใช้เมื่อกดเตรียมพัสดุทีละราย' },
  { key: 'batch', title: 'พิมพ์ฉลากรวม', hint: 'ใช้เมื่อเลือกหลายรายแล้วพิมพ์ฉลากพร้อมกัน' },
];

const paperOptions: Array<{ value: Paper; label: string }> = [
  ...Object.entries(paperSizes).map(([value, size]) => ({ value: value as Paper, label: `${size.name} (${size.widthMm} × ${size.heightMm} มม.)` })),
  { value: 'label', label: 'ขนาดเท่าฉลาก (เครื่องพิมพ์ฉลาก ม้วนละดวง)' },
  { value: 'custom', label: 'กำหนดเอง' },
];

const sample: PackageLabel = {
  attemptId: 'sample', token: 'ตัวอย่างรหัสใต้-QR-0000000000', patientName: 'นายตัวอย่าง ใจดี', deliveryAddress: '99 หมู่ 3 ต.วาริชภูมิ อ.วาริชภูมิ จ.สกลนคร',
  hn: '000000000', visitNumber: '690101000001', subdistrictCode: '471101', villageCode: '03',
};

// An empty field means the size is worked out automatically.
const blankIfAuto = (value: number | null) => (value === null ? '' : String(value));

function toDraft(layout: LabelLayout): Draft {
  return {
    ...layout,
    labelWidthMm: String(layout.labelWidthMm), labelHeightMm: String(layout.labelHeightMm),
    paperWidthMm: String(layout.paperWidthMm), paperHeightMm: String(layout.paperHeightMm), marginMm: String(layout.marginMm),
    fontPt: blankIfAuto(layout.fontPt), nameFontPt: blankIfAuto(layout.nameFontPt), addressFontPt: blankIfAuto(layout.addressFontPt), qrMm: blankIfAuto(layout.qrMm),
  };
}

function check(draft: Draft, title: string): { layout: LabelLayout | null; problem: string } {
  try {
    return { layout: parseLabelLayout(draft, title), problem: '' };
  } catch (error) {
    return { layout: null, problem: error instanceof Error ? error.message : String(error) };
  }
}

// The sheet drawn to scale with every label it holds, so the admin sees the arrangement before printing.
function PaperPreview({ layout }: { layout: LabelLayout }) {
  const page = pageLayout(layout);
  const scale = 180 / Math.max(page.widthMm, page.heightMm);
  const cells = Array.from({ length: page.perPage }, (_, index) => ({ column: index % page.columns, row: Math.floor(index / page.columns) }));
  return (
    <svg className="paper-preview" width={page.widthMm * scale} height={page.heightMm * scale} viewBox={`0 0 ${page.widthMm} ${page.heightMm}`} role="img"
      aria-label={`ตัวอย่างการจัดวาง ${page.columns} คอลัมน์ ${page.rows} แถว`}>
      <rect x={0} y={0} width={page.widthMm} height={page.heightMm} className="paper-sheet" />
      {cells.map(({ column, row }) => (
        <rect key={`${column}-${row}`} className="paper-label"
          x={page.marginMm + column * (layout.labelWidthMm + page.gapMm)} y={page.marginMm + row * (layout.labelHeightMm + page.gapMm)}
          width={layout.labelWidthMm} height={layout.labelHeightMm} />
      ))}
    </svg>
  );
}

function LayoutFields({ print, draft, onChange }: { print: (typeof prints)[number]; draft: Draft; onChange: (draft: Draft) => void }) {
  const { layout, problem } = check(draft, print.title);
  const set = (field: keyof Draft) => (event: { target: { value: string } }) => onChange({ ...draft, [field]: event.target.value });
  const page = layout && pageLayout(layout);
  // What each empty size field would print with, given the other fields as typed.
  const auto = layout && labelSizes({ ...layout, nameFontPt: null, addressFontPt: null, qrMm: null });
  const automatic = {
    basePt: layout ? `อัตโนมัติ ${labelSizes({ ...layout, fontPt: null }).basePt}` : 'อัตโนมัติ',
    namePt: auto ? `อัตโนมัติ ${auto.namePt}` : 'อัตโนมัติ',
    addressPt: auto ? `อัตโนมัติ ${auto.addressPt}` : 'อัตโนมัติ',
    qrMm: auto ? `อัตโนมัติ ${auto.qrMm}` : 'อัตโนมัติ',
  };
  return (
    <fieldset className="label-layout" aria-label={print.title}>
      <legend>{print.title}</legend>
      <p className="muted">{print.hint}</p>
      <div className="label-layout-fields">
        <label>ความกว้างฉลาก (มม.) <input name={`${print.key}-labelWidthMm`} inputMode="decimal" value={draft.labelWidthMm} onChange={set('labelWidthMm')} /></label>
        <label>ความยาวฉลาก (มม.) <input name={`${print.key}-labelHeightMm`} inputMode="decimal" value={draft.labelHeightMm} onChange={set('labelHeightMm')} /></label>
        <label>ขนาดกระดาษ
          <select name={`${print.key}-paper`} value={draft.paper} onChange={set('paper')}>
            {paperOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {draft.paper in paperSizes && (
          <label>แนวกระดาษ
            <select name={`${print.key}-orientation`} value={draft.orientation} onChange={set('orientation')}>
              <option value="portrait">แนวตั้ง</option>
              <option value="landscape">แนวนอน</option>
            </select>
          </label>
        )}
        {draft.paper === 'custom' && (
          <>
            <label>ความกว้างกระดาษ (มม.) <input name={`${print.key}-paperWidthMm`} inputMode="decimal" value={draft.paperWidthMm} onChange={set('paperWidthMm')} /></label>
            <label>ความยาวกระดาษ (มม.) <input name={`${print.key}-paperHeightMm`} inputMode="decimal" value={draft.paperHeightMm} onChange={set('paperHeightMm')} /></label>
          </>
        )}
        {draft.paper !== 'label' && (
          <label>ขอบกระดาษ (มม.) <input name={`${print.key}-marginMm`} inputMode="decimal" value={draft.marginMm} onChange={set('marginMm')} /></label>
        )}
      </div>
      <p className="muted">ขนาดตัวอักษรและ QR เว้นว่างไว้ ระบบจะคำนวณตามขนาดฉลาก (ตัวเลขในช่องคือค่าอัตโนมัติ) มีผลกับฉลากทุกหน้าที่พิมพ์ QR</p>
      <div className="label-layout-fields">
        <label>ขนาดตัวอักษรทั่วไป (pt)
          <input name={`${print.key}-fontPt`} inputMode="decimal" placeholder={automatic.basePt} value={draft.fontPt} onChange={set('fontPt')} />
        </label>
        <label>ขนาดชื่อผู้ป่วย (pt)
          <input name={`${print.key}-nameFontPt`} inputMode="decimal" placeholder={automatic.namePt} value={draft.nameFontPt} onChange={set('nameFontPt')} />
        </label>
        <label>ขนาดที่อยู่ (pt)
          <input name={`${print.key}-addressFontPt`} inputMode="decimal" placeholder={automatic.addressPt} value={draft.addressFontPt} onChange={set('addressFontPt')} />
        </label>
        <label>ขนาด QR (มม.)
          <input name={`${print.key}-qrMm`} inputMode="decimal" placeholder={automatic.qrMm} value={draft.qrMm} onChange={set('qrMm')} />
        </label>
      </div>
      {problem && <p className="notice notice-danger">{problem}</p>}
      {layout && page && (
        <div className="label-layout-preview">
          <div>
            <PaperPreview layout={layout} />
            <p><strong>หน้าละ {page.perPage} ฉลาก</strong> ({page.columns} คอลัมน์ × {page.rows} แถว)<br />กระดาษ {paperName(layout)} {page.widthMm} × {page.heightMm} มม.</p>
          </div>
          <div className="label-layout-sample">
            <span className="muted">ตัวอย่างฉลากขนาดจริง {layout.labelWidthMm} × {layout.labelHeightMm} มม.</span>
            <ParcelLabel label={sample} layout={layout} />
          </div>
        </div>
      )}
    </fieldset>
  );
}

export function AdminLabels() {
  const [drafts, setDrafts] = useState<Record<LabelPrint, Draft> | null>(null);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  function show(result: { settings: LabelSettings; saved: boolean }) {
    setDrafts({ single: toDraft(result.settings.single), batch: toDraft(result.settings.batch) });
    setSaved(result.saved);
  }

  useEffect(() => {
    void callApi<{ settings: LabelSettings; saved: boolean }>('/api/label-settings').then((result) => {
      if (!result.ok) return setMessage(result.message);
      show(result.data);
    });
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drafts) return;
    setBusy(true);
    const result = await callApi<{ settings: LabelSettings; saved: boolean }>('/api/label-settings', { method: 'PUT', json: drafts });
    setBusy(false);
    if (!result.ok) return setMessage(`บันทึกไม่สำเร็จ: ${result.message}`);
    show(result.data);
    setMessage('บันทึกการตั้งค่าฉลากแล้ว ใช้กับฉลากที่พิมพ์ครั้งถัดไป');
  }

  async function reset() {
    if (!window.confirm('กลับไปใช้ฉลาก 90 × 65 มม. บนกระดาษ A4 ตามค่าเริ่มต้นใช่ไหม')) return;
    setBusy(true);
    const result = await callApi<{ settings: LabelSettings; saved: boolean }>('/api/label-settings', { method: 'DELETE' });
    setBusy(false);
    if (!result.ok) return setMessage(result.message);
    show(result.data);
    setMessage('กลับไปใช้ค่าเริ่มต้นแล้ว');
  }

  if (!drafts) return <p aria-live="polite">{message || 'กำลังโหลดการตั้งค่าฉลาก'}</p>;

  const valid = prints.every((print) => check(drafts[print.key], print.title).layout);
  return (
    <>
      <p>กำหนดขนาดฉลาก QR พัสดุ (กว้าง × ยาว) และกระดาษที่ใช้พิมพ์ แยกสำหรับการพิมพ์ฉลากเดียวและฉลากรวม ตอนสั่งพิมพ์ให้ตั้งขนาดกระดาษในเครื่องพิมพ์ให้ตรงกัน และปิดการย่อ/ขยายหน้า (ขนาดจริง 100%)</p>
      <p aria-live="polite" className={message.startsWith('บันทึกไม่สำเร็จ') ? 'notice notice-danger' : undefined}>{message}</p>
      <form className="label-settings" aria-label="ตั้งค่าฉลาก QR" onSubmit={(event) => void save(event)}>
        {prints.map((print) => (
          <LayoutFields key={print.key} print={print} draft={drafts[print.key]} onChange={(draft) => setDrafts({ ...drafts, [print.key]: draft })} />
        ))}
        <div className="action-row">
          <button type="submit" className="btn btn-primary" disabled={busy || !valid}>บันทึก</button>
          {saved && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void reset()}>กลับไปใช้ค่าเริ่มต้น</button>}
        </div>
      </form>
    </>
  );
}
