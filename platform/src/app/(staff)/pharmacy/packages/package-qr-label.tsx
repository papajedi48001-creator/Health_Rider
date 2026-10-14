'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { shortCode } from '@/lib/labels';

// The printed label carries only the opaque token and a short attempt code, never patient data.
export function PackageQrLabel({ attemptId, token, onClose }: { attemptId: string; token: string; onClose: () => void }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    void QRCode.toDataURL(token, { errorCorrectionLevel: 'M', margin: 2, width: 320 }).then(setImage);
  }, [token]);

  return (
    <section aria-label="ฉลาก QR พัสดุ">
      <h2>ฉลาก QR พัสดุ {shortCode(attemptId)}</h2>
      {image ? <img src={image} alt={`QR พัสดุ ${shortCode(attemptId)}`} width={320} height={320} /> : <p>กำลังสร้าง QR</p>}
      {/* Printed under the QR so a rider whose camera cannot read it can type or paste the same opaque token. */}
      <p className="qr-token">รหัสใต้ QR: <code>{token}</code></p>
      <p>พิมพ์ฉลากนี้ทันที ระบบจะไม่แสดง QR เดิมซ้ำ หากฉลากหายให้ออก QR ใหม่</p>
      <button type="button" onClick={() => window.print()}>พิมพ์ฉลาก</button>
      <button type="button" onClick={onClose}>ปิด</button>
    </section>
  );
}
