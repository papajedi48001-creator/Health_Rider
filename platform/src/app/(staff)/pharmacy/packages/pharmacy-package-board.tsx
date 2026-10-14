'use client';

import { useCallback, useEffect, useState } from 'react';
import { PackageQrLabel } from '@/app/(staff)/pharmacy/packages/package-qr-label';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { EmptyState } from '@/brand/empty-state';
import { failureReasonLabels, formatThaiDateTime, shortCode } from '@/lib/labels';

type Zone = { id: string; displayName: string; subdistrictCode: string; subdistrictName: string | null };
type Row = {
  id: string; hn: string; patientName: string; deliveryAddress: string; zone: Zone;
  latestAttempt: { id: string; status: DeliveryAttemptStatus; failureReason: string | null; failedAt: string | null } | null;
};
type Board = { toPrepare: Row[]; awaitingRider: Row[]; returnRequired: Row[] };
export type BoardView = 'prepare' | 'awaiting' | 'returns';

const viewKey: Record<BoardView, keyof Board> = { prepare: 'toPrepare', awaiting: 'awaitingRider', returns: 'returnRequired' };

// One pharmacy queue per menu item: packages to prepare, packages waiting for a rider, or medication to take back.
export function PharmacyPackageBoard({ view }: { view: BoardView }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายการ');
  const [label, setLabel] = useState<{ attemptId: string; token: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [subdistrictFilter, setSubdistrictFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');

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
    window.dispatchEvent(new Event('health-rider:counts'));
    setMessage(done(result.data));
  }

  const allRows = board ? board[viewKey[view]] : [];
  const subdistricts = new Map<string, string>();
  for (const row of allRows) {
    if (!subdistricts.has(row.zone.subdistrictCode) || row.zone.subdistrictName) {
      subdistricts.set(row.zone.subdistrictCode, row.zone.subdistrictName ?? `ตำบล ${row.zone.subdistrictCode}`);
    }
  }
  const zones = new Map<string, string>();
  for (const row of allRows) {
    if (!subdistrictFilter || row.zone.subdistrictCode === subdistrictFilter) zones.set(row.zone.id, row.zone.displayName);
  }
  const matches = (row: Row) => (!subdistrictFilter || row.zone.subdistrictCode === subdistrictFilter) && (!zoneFilter || row.zone.id === zoneFilter);
  const shown = allRows.filter(matches);

  return (
    <div>
      {board && (
        <div className="filter-bar">
          <label>
            ตำบล
            <select value={subdistrictFilter} onChange={(event) => { setSubdistrictFilter(event.target.value); setZoneFilter(''); }}>
              <option value="">ทุกตำบล</option>
              {[...subdistricts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            โซนจัดส่ง
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}>
              <option value="">ทุกโซน</option>
              {[...zones.entries()].sort(([, left], [, right]) => left.localeCompare(right, 'th', { numeric: true })).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <p aria-live="polite">{message}</p>
      {label && <PackageQrLabel attemptId={label.attemptId} token={label.token} onClose={() => setLabel(null)} />}
      {board && view === 'prepare' && (
        <section>
          <h2>ต้องเตรียมพัสดุ ({shown.length})</h2>
          {shown.length === 0 ? <EmptyState text="ไม่มีรายการที่ต้องเตรียมพัสดุ" /> : (
            <ul>
              {shown.map((row) => (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · HN {row.hn} · {row.zone.displayName}</p>
                  {row.latestAttempt?.status === 'returned' && <p>ส่งใหม่หลังรับยาคืนแล้ว</p>}
                  <button type="button" disabled={busy === row.id} onClick={() => void run(row.id, '/api/pharmacy/attempts/prepare', { deliveryRequestId: row.id }, () => 'เตรียมพัสดุแล้ว พิมพ์ฉลาก QR ติดพัสดุ')}>
                    {busy === row.id ? 'กำลังเตรียม' : 'เตรียมพัสดุและออก QR'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {board && view === 'awaiting' && (
        <section>
          <h2>รอไรเดอร์รับงาน ({shown.length})</h2>
          {shown.length === 0 ? <EmptyState text="ไม่มีพัสดุที่รอไรเดอร์รับงาน" /> : (
            <ul>
              {shown.map((row) => row.latestAttempt && (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)} · {row.zone.displayName}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/qr`, {}, () => 'ออก QR ใหม่แล้ว QR เดิมใช้ไม่ได้อีก')}>
                    ออก QR ใหม่
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {board && view === 'returns' && (
        <section>
          <h2>รอรับยาคืน ({shown.length})</h2>
          {shown.length === 0 ? <EmptyState text="ไม่มียาที่รอรับคืน" /> : (
            <ul>
              {shown.map((row) => row.latestAttempt && (
                <li key={row.id}>
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)}</p>
                  <p>เหตุผล: {failureReasonLabels[row.latestAttempt.failureReason as keyof typeof failureReasonLabels] ?? '-'} · {formatThaiDateTime(row.latestAttempt.failedAt)}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/return`, {}, () => 'รับยาคืนแล้ว เตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')}>
                    ยืนยันรับยาคืน
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
