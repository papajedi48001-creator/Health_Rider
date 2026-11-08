'use client';

import QRCode from 'qrcode';
import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { defaultLabelSettings, labelSizes, pageLayout, paperName, type LabelLayout, type LabelSettings } from '@/domain/settings/label-layout';
import { callApi } from '@/lib/api-client';
import { shortCode } from '@/lib/labels';

export type PackageLabel = {
  attemptId: string; token: string; patientName: string; deliveryAddress: string; hn: string; visitNumber: string | null;
  subdistrictCode: string; villageCode: string;
};

// A shipping label: who and where to deliver, and the QR holding only the opaque token the rider scans to claim the job.
export function ParcelLabel({ label, layout }: { label: PackageLabel; layout: LabelLayout }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(label.token, { errorCorrectionLevel: 'M', margin: 1, width: 240 }).then(setImage);
  }, [label.token]);

  const sizes = labelSizes(layout);
  const qr = { width: `${sizes.qrMm}mm`, height: `${sizes.qrMm}mm` };
  return (
    <article className="parcel-label" style={labelStyle(layout)} aria-label={`ฉลากพัสดุ ${shortCode(label.attemptId)}`}>
      <div className="parcel-head">
        <strong>กรุณาส่ง</strong>
        <code className="parcel-code">HN: {label.hn}</code>
      </div>
      {/* The name gets its own full-width line so it never wraps beside the QR. */}
      <strong className="parcel-name" style={{ fontSize: `${sizes.namePt}pt` }}>{label.patientName}</strong>
      <div className="parcel-body">
        <div className="parcel-to">
          <span className="parcel-address" style={{ fontSize: `${sizes.addressPt}pt` }}>{label.deliveryAddress}</span>
        </div>
        <div className="parcel-qr">
          {image ? <img src={image} alt={`QR พัสดุ ${shortCode(label.attemptId)}`} width={120} height={120} style={qr} /> : <span style={qr}>กำลังสร้าง QR</span>}
          <strong>{label.visitNumber ?? label.hn}</strong>
        </div>
      </div>
      <div className="parcel-foot">(หากไม่มีผู้รับกรุณานำส่งคืน รพ.วาริชภูมิ)</div>
      {/* A rider whose camera cannot read the QR types the VN printed under it; without a VN only the opaque token can claim the job. */}
      {label.visitNumber ? null : <div className="qr-token">รหัสใต้ QR: <code>{label.token}</code></div>}
    </article>
  );
}

// A label is the same size in millimetres on screen as on paper.
export function labelStyle(layout: LabelLayout): CSSProperties {
  return { width: `${layout.labelWidthMm}mm`, height: `${layout.labelHeightMm}mm`, fontSize: `${labelSizes(layout).basePt}pt` };
}

// Sets the sheet size and margin for printing, and how many labels sit across each sheet.
export function labelLayoutCss(layout: LabelLayout): string {
  const page = pageLayout(layout);
  return [
    `.label-page { grid-template-columns: repeat(auto-fill, ${layout.labelWidthMm}mm); }`,
    '@media print {',
    `  @page { size: ${page.widthMm}mm ${page.heightMm}mm; margin: ${page.marginMm}mm; }`,
    `  .label-page { grid-template-columns: repeat(${page.columns}, ${layout.labelWidthMm}mm); gap: ${page.gapMm}mm; }`,
    '}',
  ].join('\n');
}

export function describeLayout(layout: LabelLayout): string {
  const page = pageLayout(layout);
  return `ฉลาก ${layout.labelWidthMm} × ${layout.labelHeightMm} มม. บนกระดาษ ${paperName(layout)} หน้าละ ${page.perPage} ฉลาก`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) pages.push(items.slice(index, index + size));
  return pages;
}

// Opens over the page so the labels can be printed straight away. It closes only from its own button,
// because a QR is never shown again once this is closed. One label prints with the admin's single-label
// layout, several with the batch layout.
export function PackageQrSheet({ labels, onClose }: { labels: PackageLabel[]; onClose: () => void }) {
  const [settings, setSettings] = useState<LabelSettings>(defaultLabelSettings);

  useEffect(() => {
    void callApi<{ settings: LabelSettings }>('/api/label-settings').then((result) => { if (result.ok) setSettings(result.data.settings); });
  }, []);

  const layout = labels.length === 1 ? settings.single : settings.batch;
  // Each sheet of paper is its own grid so a label never splits across two sheets.
  const pages = chunk(labels, pageLayout(layout).perPage);
  // Rendered straight under <body> so printing can drop the rest of the page instead of leaving blank sheets behind it.
  return createPortal(
    <div className="photo-viewer label-dialog" role="dialog" aria-modal="true" aria-label="ฉลาก QR พัสดุ">
      <style>{labelLayoutCss(layout)}</style>
      <section className="photo-viewer-body label-sheet">
        <div className="label-toolbar">
          <h2>ฉลาก QR พัสดุ {labels.length} ชิ้น</h2>
          <p>พิมพ์ฉลากทันที ระบบจะไม่แสดง QR เดิมซ้ำ หากฉลากหายให้ออก QR ใหม่ · {describeLayout(layout)}</p>
          <div className="label-actions">
            <button type="button" className="btn btn-primary" autoFocus onClick={() => window.print()}>พิมพ์ฉลาก</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ปิด</button>
          </div>
        </div>
        {pages.map((page, index) => (
          <div key={index} className="label-grid label-page">
            {page.map((label) => <ParcelLabel key={label.attemptId} label={label} layout={layout} />)}
          </div>
        ))}
      </section>
    </div>,
    document.body,
  );
}
