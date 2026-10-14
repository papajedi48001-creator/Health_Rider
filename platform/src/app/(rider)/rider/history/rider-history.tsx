'use client';

import { useEffect, useState } from 'react';
import type { FailedDeliveryReason } from '@/domain/delivery/offline-event-rules';
import type { HistoryFilter, HistoryOutcome } from '@/domain/delivery/rider-history';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels, formatThaiDateTime } from '@/lib/labels';
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
      <section>
        <label>
          ตั้งแต่วันที่
          <input type="date" value={from} max={to} onChange={(event) => event.target.value && change(() => setFrom(event.target.value))} />
        </label>
        <label>
          ถึงวันที่
          <input type="date" value={to} min={from} onChange={(event) => event.target.value && change(() => setTo(event.target.value))} />
        </label>
        <label>
          สถานะการส่ง
          <select value={outcome} onChange={(event) => change(() => setOutcome(event.target.value as HistoryFilter))}>
            <option value="all">ทั้งหมด</option>
            <option value="delivered">ส่งสำเร็จ</option>
            <option value="failed">ส่งไม่สำเร็จ</option>
          </select>
        </label>
        {history && (
          <p>
            <span className="outcome-delivered">ส่งสำเร็จ {history.counts.delivered} ราย</span>
            {' · '}
            <span className="outcome-failed">ส่งไม่สำเร็จ {history.counts.failed} ราย</span>
          </p>
        )}
      </section>
      <p aria-live="polite" role="status">{message}</p>
      {history && history.items.length > 0 && (
        <>
          <ul className="history">
            {history.items.map((item) => (
              <li key={item.id}>
                <h2>{item.patientName}</h2>
                <p>HN {item.hn} · {formatThaiDateTime(item.finishedAt)}</p>
                <p>{item.address}</p>
                {item.outcome === 'delivered' ? (
                  <p className="outcome-delivered">ส่งสำเร็จ</p>
                ) : (
                  <p className="outcome-failed">
                    ส่งไม่สำเร็จ{item.failureReason ? `: ${failureReasonLabels[item.failureReason] ?? item.failureReason}` : ''}
                    {item.status === 'returned' ? ' (คืนยาแล้ว)' : item.status === 'return_required' ? ' (รอคืนยา)' : ''}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <nav aria-label="เปลี่ยนหน้า" className="pager">
            <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
            <span>หน้า {history.page} จาก {history.pages} ({history.total} รายการ)</span>
            <button type="button" disabled={page >= history.pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
          </nav>
        </>
      )}
    </main>
  );
}
