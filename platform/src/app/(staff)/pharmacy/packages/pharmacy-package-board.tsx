'use client';

import { useCallback, useEffect, useState } from 'react';
import { PackageQrLabel } from '@/app/(staff)/pharmacy/packages/package-qr-label';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels, formatThaiDateTime, shortCode } from '@/lib/labels';

type Row = {
  id: string; hn: string; patientName: string; deliveryAddress: string; zone: string;
  latestAttempt: { id: string; status: DeliveryAttemptStatus; failureReason: string | null; failedAt: string | null } | null;
};
type Board = { toPrepare: Row[]; awaitingRider: Row[]; returnRequired: Row[] };

export function PharmacyPackageBoard() {
  const [board, setBoard] = useState<Board | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายการ');
  const [label, setLabel] = useState<{ attemptId: string; token: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await callApi<Board>('/api/pharmacy/requests');
    if (!result.ok) return setMessage(result.message);
    setBoard(result.data);
    setMessage('');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, url: string, body: unknown, done: (data: { attemptId: string; token?: string }) => string) {
    setBusy(key);
    const result = await callApi<{ attemptId: string; token?: string }>(url, { json: body });
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    if (result.data.token) setLabel({ attemptId: result.data.attemptId, token: result.data.token });
    await load();
    setMessage(done(result.data));
  }

  return (
    <div>
      <p aria-live="polite">{message}</p>
      {label && <PackageQrLabel attemptId={label.attemptId} token={label.token} onClose={() => setLabel(null)} />}
      {board && (
        <>
          <section>
            <h2>ต้องเตรียมพัสดุ ({board.toPrepare.length})</h2>
            <ul>
              {board.toPrepare.map((row) => (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · HN {row.hn} · {row.zone}</p>
                  {row.latestAttempt?.status === 'returned' && <p>ส่งใหม่หลังรับยาคืนแล้ว</p>}
                  <button type="button" disabled={busy === row.id} onClick={() => void run(row.id, '/api/pharmacy/attempts/prepare', { deliveryRequestId: row.id }, () => 'เตรียมพัสดุแล้ว พิมพ์ฉลาก QR ติดพัสดุ')}>
                    {busy === row.id ? 'กำลังเตรียม' : 'เตรียมพัสดุและออก QR'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>รอไรเดอร์รับงาน ({board.awaitingRider.length})</h2>
            <ul>
              {board.awaitingRider.map((row) => row.latestAttempt && (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)} · {row.zone}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/qr`, {}, () => 'ออก QR ใหม่แล้ว QR เดิมใช้ไม่ได้อีก')}>
                    ออก QR ใหม่
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2>รอรับยาคืน ({board.returnRequired.length})</h2>
            <ul>
              {board.returnRequired.map((row) => row.latestAttempt && (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)}</p>
                  <p>เหตุผล: {failureReasonLabels[row.latestAttempt.failureReason as keyof typeof failureReasonLabels] ?? '-'} · {formatThaiDateTime(row.latestAttempt.failedAt)}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/return`, {}, () => 'รับยาคืนแล้ว เตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')}>
                    ยืนยันรับยาคืน
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
