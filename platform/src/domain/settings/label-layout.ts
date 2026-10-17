import { DomainError } from '@/domain/errors';

export const labelSettingKey = 'qr_label';

export const paperSizes = {
  A4: { name: 'A4', widthMm: 210, heightMm: 297 },
  A5: { name: 'A5', widthMm: 148, heightMm: 210 },
  A6: { name: 'A6', widthMm: 105, heightMm: 148 },
  letter: { name: 'Letter', widthMm: 216, heightMm: 279 },
} as const;
export type PresetPaper = keyof typeof paperSizes;
// "label" prints one label per sheet on a roll the size of the label; "custom" takes the admin's own sheet size.
export type Paper = PresetPaper | 'label' | 'custom';
export const papers: Paper[] = ['A4', 'A5', 'A6', 'letter', 'label', 'custom'];
export type Orientation = 'portrait' | 'landscape';

export type LabelLayout = {
  labelWidthMm: number;
  labelHeightMm: number;
  paper: Paper;
  orientation: Orientation;
  // Only used when paper is "custom".
  paperWidthMm: number;
  paperHeightMm: number;
  marginMm: number;
};

// "single" applies when one package is prepared, "batch" when several labels print together.
export type LabelSettings = { single: LabelLayout; batch: LabelLayout };
export type LabelPrint = 'single' | 'batch';

export const labelGapMm = 3;
export const limits = { label: [20, 300], paper: [30, 600], margin: [0, 30] } as const;

// The layout the app printed before labels could be configured: 90 × 65 mm, two columns on A4.
const standardLayout: LabelLayout = {
  labelWidthMm: 90, labelHeightMm: 65, paper: 'A4', orientation: 'portrait', paperWidthMm: 210, paperHeightMm: 297, marginMm: 10,
};
export const defaultLabelSettings: LabelSettings = { single: { ...standardLayout }, batch: { ...standardLayout } };

export type PageLayout = { widthMm: number; heightMm: number; marginMm: number; gapMm: number; columns: number; rows: number; perPage: number };

export function pageLayout(layout: LabelLayout): PageLayout {
  if (layout.paper === 'label') {
    return { widthMm: layout.labelWidthMm, heightMm: layout.labelHeightMm, marginMm: 0, gapMm: 0, columns: 1, rows: 1, perPage: 1 };
  }
  let widthMm = layout.paperWidthMm;
  let heightMm = layout.paperHeightMm;
  if (layout.paper !== 'custom') {
    const preset = paperSizes[layout.paper];
    [widthMm, heightMm] = layout.orientation === 'landscape' ? [preset.heightMm, preset.widthMm] : [preset.widthMm, preset.heightMm];
  }
  const fit = (space: number, size: number) => Math.max(0, Math.floor((space - 2 * layout.marginMm + labelGapMm) / (size + labelGapMm)));
  const columns = fit(widthMm, layout.labelWidthMm);
  const rows = fit(heightMm, layout.labelHeightMm);
  return { widthMm, heightMm, marginMm: layout.marginMm, gapMm: labelGapMm, columns, rows, perPage: columns * rows };
}

export function paperName(layout: LabelLayout): string {
  if (layout.paper === 'label') return 'ขนาดเท่าฉลาก';
  if (layout.paper === 'custom') return `กำหนดเอง ${layout.paperWidthMm} × ${layout.paperHeightMm} มม.`;
  return `${paperSizes[layout.paper].name} ${layout.orientation === 'landscape' ? 'แนวนอน' : 'แนวตั้ง'}`;
}

function millimetres(value: unknown, name: string, [min, max]: readonly [number, number]): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    throw new DomainError(`${name}ต้องเป็นตัวเลข ${min}-${max} มม.`);
  }
  return Math.round(number * 10) / 10;
}

export function parseLabelLayout(value: unknown, title: string): LabelLayout {
  const body = (value ?? {}) as Record<string, unknown>;
  if (!(papers as unknown[]).includes(body.paper)) throw new DomainError(`${title}: เลือกขนาดกระดาษ`);
  const paper = body.paper as Paper;
  const layout: LabelLayout = {
    labelWidthMm: millimetres(body.labelWidthMm, `${title}: ความกว้างฉลาก`, limits.label),
    labelHeightMm: millimetres(body.labelHeightMm, `${title}: ความยาวฉลาก`, limits.label),
    paper,
    orientation: body.orientation === 'landscape' ? 'landscape' : 'portrait',
    paperWidthMm: paper === 'custom' ? millimetres(body.paperWidthMm, `${title}: ความกว้างกระดาษ`, limits.paper) : standardLayout.paperWidthMm,
    paperHeightMm: paper === 'custom' ? millimetres(body.paperHeightMm, `${title}: ความยาวกระดาษ`, limits.paper) : standardLayout.paperHeightMm,
    marginMm: paper === 'label' ? 0 : millimetres(body.marginMm, `${title}: ขอบกระดาษ`, limits.margin),
  };
  if (pageLayout(layout).perPage === 0) {
    throw new DomainError(`${title}: ฉลาก ${layout.labelWidthMm} × ${layout.labelHeightMm} มม. ใหญ่กว่าพื้นที่พิมพ์ของกระดาษ ${paperName(layout)} (หักขอบแล้ว)`);
  }
  return layout;
}

export function parseLabelSettings(value: unknown): LabelSettings {
  const body = (value ?? {}) as Record<string, unknown>;
  return { single: parseLabelLayout(body.single, 'ฉลากเดียว'), batch: parseLabelLayout(body.batch, 'ฉลากรวม') };
}

type SettingStore = { findUnique(args: { where: { key: string } }): Promise<{ value: unknown } | null> };

// A saved value that no longer passes the rules (say, after the limits change) falls back to the standard layout.
export async function loadLabelSettings(store: SettingStore): Promise<{ settings: LabelSettings; saved: boolean }> {
  const stored = (await store.findUnique({ where: { key: labelSettingKey } }))?.value;
  if (stored === undefined || stored === null) return { settings: defaultLabelSettings, saved: false };
  try {
    return { settings: parseLabelSettings(stored), saved: true };
  } catch {
    return { settings: defaultLabelSettings, saved: false };
  }
}

// Text is sized against the standard 90 × 65 mm label so a bigger or smaller label keeps the same look.
export function labelFontPt(layout: LabelLayout): number {
  const scale = Math.min(layout.labelWidthMm / standardLayout.labelWidthMm, layout.labelHeightMm / standardLayout.labelHeightMm);
  return Math.min(22, Math.max(5, Math.round(11 * scale * 10) / 10));
}
