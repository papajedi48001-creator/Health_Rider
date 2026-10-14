'use client';

import { useEffect, useState } from 'react';
import type { FailedDeliveryReason } from '@/domain/delivery/offline-event-rules';
import type { HistoryFilter, HistoryOutcome } from '@/domain/delivery/rider-history';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels, formatThaiDateTime, recipientRelationLabels } from '@/lib/labels';
import type { RecipientRelation } from '@/domain/delivery/offline-event-rules';
import { bangkokDateString } from '@/lib/time';

type HistoryItem = {
  id: string;
  outcome: HistoryOutcome;
  status: DeliveryAttemptStatus;
  finishedAt: string;
  failureReason: FailedDeliveryReason | null;
  hn: string;
  patientName: string;
  address: string;
  hasPhoto: boolean;
  recipientRelation: RecipientRelation | null;
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

  // Any filter change starts again from the first page.
  function change(update: () => void) {
    update();
    setPage(1);
  }

  return (
    <main>
      <h1>ประวัติการส่งของฉัน</h1>
      <section aria-label="ตัวกรองประวัติ">
        <div className="field-pair">
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
          <div className="stats" style={{ marginTop: 14 }}>
            <p className="stat"><span className="outcome-delivered">ส่งสำเร็จ<strong>{history.counts.delivered} ราย</strong></span></p>
            <p className="stat failed"><span className="outcome-failed">ส่งไม่สำเร็จ<strong>{history.counts.failed} ราย</strong></span></p>
          </div>
        )}
      </section>
      <p aria-live="polite" role="status">{message}</p>
      {history && history.items.length > 0 && (
        <>
          <ul className="history">
            {history.items.map((item) => <HistoryCard key={item.id} item={item} />)}
          </ul>
          <nav aria-label="เปลี่ยนหน้า" className="pager">
            <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
            <span>หน้า {history.page}/{history.pages}<br />({history.total} รายการ)</span>
            <button type="button" className="secondary" disabled={page >= history.pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
          </nav>
        </>
      )}
    </main>
  );
}

// The evidence photo loads only when the rider asks for it, so lists never preview evidence (DESIGN.md)
// and a phone on mobile data downloads one photo at a time.
function HistoryCard({ item }: { item: HistoryItem }) {
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const photoUrl = `/api/rider/history/${item.id}/photo`;
  return (
    <li>
      <div className="card-head">
        <h2>{item.patientName}</h2>
        {item.outcome === 'delivered'
          ? <span className="badge outcome-delivered">ส่งสำเร็จ</span>
          : <span className="badge outcome-failed">ไม่สำเร็จ</span>}
      </div>
      <p className="meta">HN {item.hn} · {formatThaiDateTime(item.finishedAt)}</p>
      <p>{item.address}</p>
      {item.outcome === 'delivered' ? (
        item.recipientRelation && <p className="meta">ผู้รับยา: {recipientRelationLabels[item.recipientRelation] ?? item.recipientRelation}</p>
      ) : (
        <p className="outcome-failed">
          ส่งไม่สำเร็จ{item.failureReason ? `: ${failureReasonLabels[item.failureReason] ?? item.failureReason}` : ''}
          {item.status === 'returned' ? ' (คืนยาแล้ว)' : item.status === 'return_required' ? ' (รอคืนยา)' : ''}
        </p>
      )}
      {item.hasPhoto && (
        <>
          <button type="button" className="secondary" aria-expanded={showPhoto} onClick={() => { setShowPhoto(!showPhoto); setPhotoFailed(false); }}>
            {showPhoto ? 'ซ่อนรูปหลักฐาน' : 'ดูรูปหลักฐาน'}
          </button>
          {showPhoto && (photoFailed
            ? <p className="badge pending">โหลดรูปไม่ได้ ต้องออนไลน์เพื่อดูรูปหลักฐาน</p>
            : (
              <a href={photoUrl} target="_blank" rel="noreferrer">
                <img className="evidence-photo" src={photoUrl} alt={`รูปหลักฐานการส่งยา ${item.patientName}`} onError={() => setPhotoFailed(true)} />
              </a>
            ))}
        </>
      )}
    </li>
  );
}
