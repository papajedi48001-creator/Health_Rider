'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { shortCode } from '@/lib/labels';

export type PackageLabel = {
  attemptId: string; token: string; patientName: string; deliveryAddress: string; hn: string; visitNumber: string | null;
  subdistrictCode: string; villageCode: string;
};

// A shipping label: who and where to deliver, and the QR holding only the opaque token the rider scans to claim the job.
function ParcelLabel({ label }: { label: PackageLabel }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(label.token, { errorCorrectionLevel: 'M', margin: 1, width: 240 }).then(setImage);
  }, [label.token]);

  return (
    <article className="parcel-label" aria-label={`ฉลากพัสดุ ${shortCode(label.attemptId)}`}>
      <div className="parcel-head">
        <strong>กรุณาส่ง</strong>
        <code className="parcel-code">CODE: {label.subdistrictCode}-{label.villageCode}</code>
      </div>
      <div className="parcel-body">
        <div className="parcel-to">
          <strong className="parcel-name">{label.patientName}</strong>
          <span className="parcel-address">{label.deliveryAddress}</span>
        </div>
        <div className="parcel-qr">
          {image ? <img src={image} alt={`QR พัสดุ ${shortCode(label.attemptId)}`} width={120} height={120} /> : <span>กำลังสร้าง QR</span>}
          <strong>{label.visitNumber ?? label.hn}</strong>
        </div>
      </div>
      <div className="parcel-foot">(หากไม่มีผู้รับกรุณานำส่งคืน รพ.วาริชภูมิ)</div>
      {/* Printed small so a rider whose camera cannot read the QR can type the same opaque token. */}
      <div className="qr-token">รหัสใต้ QR: <code>{label.token}</code></div>
    </article>
  );
}

// Opens over the page so the labels can be printed straight away. It closes only from its own button,
// because a QR is never shown again once this is closed.
export function PackageQrSheet({ labels, onClose }: { labels: PackageLabel[]; onClose: () => void }) {
  return (
    <div className="photo-viewer label-dialog" role="dialog" aria-modal="true" aria-label="ฉลาก QR พัสดุ">
      <section className="photo-viewer-body label-sheet">
        <div className="label-toolbar">
          <h2>ฉลาก QR พัสดุ {labels.length} ชิ้น</h2>
          <p>พิมพ์ฉลากทันที ระบบจะไม่แสดง QR เดิมซ้ำ หากฉลากหายให้ออก QR ใหม่</p>
          <div className="label-actions">
            <button type="button" className="btn btn-primary" autoFocus onClick={() => window.print()}>พิมพ์ฉลาก</button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>ปิด</button>
          </div>
        </div>
        <div className="label-grid">
          {labels.map((label) => <ParcelLabel key={label.attemptId} label={label} />)}
        </div>
      </section>
    </div>
  );
}
