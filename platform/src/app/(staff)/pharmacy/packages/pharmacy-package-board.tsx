'use client';

import { useCallback, useEffect, useState } from 'react';
import { DeliveryInfoButton } from '@/app/(staff)/operations/delivery-details';
import { PackageQrSheet, type PackageLabel } from '@/app/(staff)/pharmacy/packages/package-qr-label';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { EmptyState } from '@/brand/empty-state';
import { failureReasonLabels, formatThaiDateTime, shortCode } from '@/lib/labels';

type Zone = { id: string; displayName: string; subdistrictCode: string; subdistrictName: string | null; villageCode: string };
type Row = {
  id: string; visitNumber: string | null; hn: string; patientName: string; deliveryAddress: string; zone: Zone;
  latestAttempt: { id: string; status: DeliveryAttemptStatus; failureReason: string | null; failedAt: string | null } | null;
};
type Board = { toPrepare: Row[]; awaitingRider: Row[]; returnRequired: Row[] };
export type BoardView = 'prepare' | 'awaiting' | 'returns';

const viewKey: Record<BoardView, keyof Board> = { prepare: 'toPrepare', awaiting: 'awaitingRider', returns: 'returnRequired' };

type Issued = { attemptId: string; token?: string };

function labelFor(row: Row, issued: Issued & { token: string }): PackageLabel {
  return {
    attemptId: issued.attemptId, token: issued.token, patientName: row.patientName, deliveryAddress: row.deliveryAddress,
    hn: row.hn, visitNumber: row.visitNumber, subdistrictCode: row.zone.subdistrictCode, villageCode: row.zone.villageCode,
  };
}

// Preparing issues a package and its first QR; for a package already waiting for a rider, a new QR replaces the old one.
function issueRequest(view: BoardView, row: Row): { url: string; body: unknown } {
  return view === 'prepare'
    ? { url: '/api/pharmacy/attempts/prepare', body: { deliveryRequestId: row.id } }
    : { url: `/api/pharmacy/attempts/${row.latestAttempt!.id}/qr`, body: {} };
}

// One pharmacy queue per menu item: packages to prepare, packages waiting for a rider, or medication to take back.
export function PharmacyPackageBoard({ view }: { view: BoardView }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายการ');
  const [labels, setLabels] = useState<PackageLabel[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [subdistrictFilter, setSubdistrictFilter] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const result = await callApi<Board>('/api/pharmacy/requests');
    if (!result.ok) return setMessage(result.message);
    setBoard(result.data);
    setMessage('');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(key: string, url: string, body: unknown, done: string, row?: Row) {
    setBusy(key);
    const result = await callApi<Issued>(url, { json: body });
    setBusy(null);
    if (!result.ok) return setMessage(result.message);
    const { token } = result.data;
    if (row && token) setLabels([labelFor(row, { ...result.data, token })]);
    await load();
    window.dispatchEvent(new Event('health-rider:counts'));
    setMessage(done);
  }

  // Issues the QR for every ticked row one by one, so one failure does not lose the labels already issued.
  async function printSelected(rows: Row[]) {
    setBusy('batch');
    const issued: PackageLabel[] = [];
    const failed: string[] = [];
    for (const row of rows) {
      const { url, body } = issueRequest(view, row);
      const result = await callApi<Issued>(url, { json: body });
      const token = result.ok ? result.data.token : undefined;
      if (result.ok && token) issued.push(labelFor(row, { ...result.data, token }));
      else failed.push(row.patientName);
    }
    setBusy(null);
    setSelected(new Set());
    if (issued.length > 0) setLabels(issued);
    await load();
    window.dispatchEvent(new Event('health-rider:counts'));
    setMessage(failed.length === 0 ? `ออก QR แล้ว ${issued.length} ชิ้น พิมพ์ฉลากติดพัสดุ` : `ออก QR แล้ว ${issued.length} ชิ้น ไม่สำเร็จ ${failed.length} ราย: ${failed.join(', ')}`);
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
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
  // Only the prepare queue has a search box: pharmacy looks up the patient whose medicine is in hand by HN or name words.
  const terms = view === 'prepare' ? query.trim().split(/\s+/).filter(Boolean) : [];
  const inZone = allRows.filter((row) => (!subdistrictFilter || row.zone.subdistrictCode === subdistrictFilter) && (!zoneFilter || row.zone.id === zoneFilter));
  const shown = inZone.filter((row) => terms.every((term) => `${row.hn} ${row.patientName}`.includes(term)));
  const ticked = shown.filter((row) => selected.has(row.id));
  const allTicked = shown.length > 0 && ticked.length === shown.length;

  // Shown on the queues that issue QR: tick people one by one, or every package in the filtered zone.
  const selectBar = (action: string) => (
    <div className="select-bar">
      <label>
        <input
          type="checkbox"
          checked={allTicked}
          onChange={() => setSelected(allTicked ? new Set() : new Set(shown.map((row) => row.id)))}
        />
        เลือกทั้งหมด{terms.length > 0 ? 'ที่ค้นพบ' : zoneFilter ? 'ในโซนนี้' : subdistrictFilter ? 'ในตำบลนี้' : ''} ({shown.length})
      </label>
      <button type="button" className="btn btn-primary btn-small" disabled={ticked.length === 0 || busy !== null} onClick={() => void printSelected(ticked)}>
        {busy === 'batch' ? 'กำลังออก QR' : `${action} (${ticked.length})`}
      </button>
    </div>
  );
  const pick = (row: Row) => (
    <label className="pick">
      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`เลือกพิมพ์ ${row.patientName}`} />
      เลือกพิมพ์
    </label>
  );

  // The latest package of a request, for the details pop-up; a request not yet prepared has none.
  const info = (row: Row) => row.latestAttempt && <DeliveryInfoButton attemptId={row.latestAttempt.id} patientName={row.patientName} />;

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
          {view === 'prepare' && (
            <label>
              ค้นหา HN / ชื่อคนไข้
              <input type="search" list="package-patients" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          )}
        </div>
      )}
      {/* The browser suggests matching patients while typing; picking one fills "name HN", which narrows to that patient. */}
      {view === 'prepare' && (
        <datalist id="package-patients">
          {inZone.map((row) => <option key={row.id} value={`${row.patientName} ${row.hn}`} />)}
        </datalist>
      )}
      <p aria-live="polite">{message}</p>
      {labels && <PackageQrSheet labels={labels} onClose={() => setLabels(null)} />}
      {board && view === 'prepare' && (
        <section>
          <h2>ต้องเตรียมพัสดุ ({shown.length})</h2>
          {shown.length === 0 ? <EmptyState text={terms.length > 0 ? 'ไม่พบคนไข้ที่ตรงกับคำค้นหา' : 'ไม่มีรายการที่ต้องเตรียมพัสดุ'} /> : (
            <>
            {selectBar('เตรียมพัสดุและพิมพ์ QR ที่เลือก')}
            <ul className="pick-list">
              {shown.map((row) => (
                <li key={row.id}>
                  {pick(row)}
                  <p><strong>{row.patientName}</strong> · HN {row.hn} · {row.zone.displayName}</p>
                  {row.latestAttempt?.status === 'returned' && <p>ส่งใหม่หลังรับยาคืนแล้ว {info(row)}</p>}
                  <button type="button" disabled={busy === row.id} onClick={() => void run(row.id, '/api/pharmacy/attempts/prepare', { deliveryRequestId: row.id }, 'เตรียมพัสดุแล้ว พิมพ์ฉลาก QR ติดพัสดุ', row)}>
                    {busy === row.id ? 'กำลังเตรียม' : 'เตรียมพัสดุและออก QR'}
                  </button>
                </li>
              ))}
            </ul>
            </>
          )}
        </section>
      )}
      {board && view === 'awaiting' && (
        <section>
          <h2>รอไรเดอร์รับงาน ({shown.length})</h2>
          {shown.length === 0 ? <EmptyState text="ไม่มีพัสดุที่รอไรเดอร์รับงาน" /> : (
            <>
            {selectBar('ออก QR ใหม่และพิมพ์ที่เลือก')}
            <ul className="pick-list">
              {shown.map((row) => row.latestAttempt && (
                <li key={row.id}>
                  {pick(row)}
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)} · {row.zone.displayName} {info(row)}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/qr`, {}, 'ออก QR ใหม่แล้ว QR เดิมใช้ไม่ได้อีก', row)}>
                    ออก QR ใหม่
                  </button>
                </li>
              ))}
            </ul>
            </>
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
                  <p><strong>{row.patientName}</strong> · พัสดุ {shortCode(row.latestAttempt.id)} {info(row)}</p>
                  <p>เหตุผล: {failureReasonLabels[row.latestAttempt.failureReason as keyof typeof failureReasonLabels] ?? '-'} · {formatThaiDateTime(row.latestAttempt.failedAt)}</p>
                  <button type="button" disabled={busy === row.latestAttempt.id} onClick={() => void run(row.latestAttempt!.id, `/api/pharmacy/attempts/${row.latestAttempt!.id}/return`, {}, 'รับยาคืนแล้ว เตรียมพัสดุใหม่ได้เมื่อพร้อมส่งอีกครั้ง')}>
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
