'use client';

import { useEffect, useState } from 'react';
import type { FailedDeliveryReason, RecipientRelation } from '@/domain/delivery/offline-event-rules';
import type { HistoryFilter, HistoryOutcome } from '@/domain/delivery/rider-history';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels, formatThaiDateTime, recipientRelationLabels } from '@/lib/labels';
import { EmptyState } from '@/brand/empty-state';
import { Icon } from '@/brand/icons';
import { bangkokDateString } from '@/lib/time';

type HistoryItem = {
  id: string;
  outcome: HistoryOutcome;
  status: DeliveryAttemptStatus;
  finishedAt: string;
  failureReason: FailedDeliveryReason | null;
  hasEvidence: boolean;
  recipientRelation: RecipientRelation | null;
  hn: string;
  patientName: string;
  address: string;
};
type HistoryPage = { page: number; pages: number; total: number; counts: Record<HistoryOutcome, number>; items: HistoryItem[] };

const dayMs = 24 * 60 * 60 * 1000;

export function RiderHistory() {
  const [from, setFrom] = useState(() => bangkokDateString(new Date(Date.now() - 6 * dayMs)));
  const [to, setTo] = useState(() => bangkokDateString(new Date()));
  const [outcome, setOutcome] = useState<HistoryFilter>('all');
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [message, setMessage] = useState('กำลังโหลดประวัติการส่ง');
  const [photoOf, setPhotoOf] = useState<HistoryItem | null>(null);

  useEffect(() => {
    let current = true;
    setMessage('กำลังโหลดประวัติการส่ง');
    const params = new URLSearchParams({ from, to, outcome, page: String(page) });
    void callApi<HistoryPage>(`/api/rider/history?${params}`).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setHistory(null);
        setMessage(result.message);
        return;
      }
      setHistory(result.data);
      setMessage(result.data.total === 0 ? 'ไม่มีประวัติการส่งในช่วงวันที่นี้' : '');
    });
    return () => { current = false; };
  }, [from, to, outcome, page]);

  useEffect(() => {
    if (!photoOf) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setPhotoOf(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [photoOf]);

  // Any filter change starts again from the first page.
  function change(update: () => void) {
    update();
    setPage(1);
  }

  return (
    <main className="rider-page">
      <h1>ประวัติการส่งของฉัน</h1>
      <section className="rider-card filters" aria-label="ตัวกรอง">
        <div className="date-range">
          <label>
            ตั้งแต่วันที่
            <input type="date" value={from} max={to} onChange={(event) => event.target.value && change(() => setFrom(event.target.value))} />
          </label>
          <label>
            ถึงวันที่
            <input type="date" value={to} min={from} onChange={(event) => event.target.value && change(() => setTo(event.target.value))} />
          </label>
        </div>
        <label>
          สถานะการส่ง
          <select value={outcome} onChange={(event) => change(() => setOutcome(event.target.value as HistoryFilter))}>
            <option value="all">ทั้งหมด</option>
            <option value="delivered">ส่งสำเร็จ</option>
            <option value="failed">ส่งไม่สำเร็จ</option>
          </select>
        </label>
        {history && (
          <div className="summary">
            <span className="summary-tile outcome-delivered"><strong>{history.counts.delivered}</strong> ส่งสำเร็จ</span>
            <span className="summary-tile outcome-failed"><strong>{history.counts.failed}</strong> ส่งไม่สำเร็จ</span>
          </div>
        )}
      </section>
      {history && history.total === 0 ? <EmptyState text={message} /> : <p aria-live="polite" role="status">{message}</p>}
      {history && history.items.length > 0 && (
        <>
          <ul className="job-list">
            {history.items.map((item) => (
              <li key={item.id} className="history-item">
                <div className="history-head">
                  <h2>{item.patientName}</h2>
                  {item.outcome === 'delivered' ? (
                    <span className="chip chip-success outcome-delivered">ส่งสำเร็จ</span>
                  ) : (
                    <span className="chip chip-danger outcome-failed">ส่งไม่สำเร็จ</span>
                  )}
                </div>
                <p className="muted">HN {item.hn} · {formatThaiDateTime(item.finishedAt)}</p>
                <p>{item.address}</p>
                {item.outcome === 'delivered' ? (
                  item.recipientRelation && <p>ผู้รับยา: {recipientRelationLabels[item.recipientRelation] ?? item.recipientRelation}</p>
                ) : (
                  <p className="outcome-failed">
                    ส่งไม่สำเร็จ{item.failureReason ? `: ${failureReasonLabels[item.failureReason] ?? item.failureReason}` : ''}
                    {item.status === 'returned' ? ' (คืนยาแล้ว)' : item.status === 'return_required' ? ' (รอคืนยา)' : ''}
                  </p>
                )}
                {item.hasEvidence && (
                  <button type="button" className="btn btn-secondary btn-block" onClick={() => setPhotoOf(item)}>
                    <Icon name="image" /> ดูรูปหลักฐาน
                  </button>
                )}
              </li>
            ))}
          </ul>
          <nav aria-label="เปลี่ยนหน้า" className="pager">
            <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
            <span>หน้า {history.page}/{history.pages}<br /><small>{history.total} รายการ</small></span>
            <button type="button" className="btn btn-secondary" disabled={page >= history.pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
          </nav>
        </>
      )}
      {photoOf && (
        <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={`รูปหลักฐานการส่ง ${photoOf.patientName}`} onClick={() => setPhotoOf(null)}>
          <div className="photo-viewer-body" onClick={(event) => event.stopPropagation()}>
            <div className="photo-viewer-head">
              <strong>{photoOf.patientName}</strong>
              <button type="button" className="icon-button" aria-label="ปิดรูป" onClick={() => setPhotoOf(null)} autoFocus><Icon name="close" /></button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- a private, uncached image served by our own API */}
            <img src={`/api/rider/attempts/${photoOf.id}/evidence`} alt={`รูปหลักฐานการส่ง ${photoOf.patientName}`} />
            <p className="muted">{formatThaiDateTime(photoOf.finishedAt)}</p>
          </div>
        </div>
      )}
    </main>
  );
}
