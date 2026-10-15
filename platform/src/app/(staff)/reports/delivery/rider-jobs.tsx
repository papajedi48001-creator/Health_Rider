'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels, formatThaiDateTime, statusLabels } from '@/lib/labels';
import { statusTone } from '@/lib/status-tone';
import { minutes, ReportSection, type Range } from '@/reports/report-kit';
import { withBasePath } from '@/lib/base-path';

type RiderJobs = {
  rider: { id: string; displayName: string; riderCode: string | null };
  page: number; pages: number; total: number;
  items: Array<{
    id: string; packageCode: string; status: DeliveryAttemptStatus; hn: string; patientName: string; zone: string;
    claimedAt: string | null; finishedAt: string | null; failureReason: string | null; minutes: number | null; hasEvidence: boolean;
  }>;
};

// The jobs behind one rider's row in the delivery report, for the same date range.
export function RiderJobsPanel({ riderId, range, onClose }: { riderId: string; range: Range; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RiderJobs | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายการงาน');
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => { setPage(1); }, [riderId, range]);
  useEffect(() => {
    let current = true;
    void callApi<RiderJobs>(`/api/reports/delivery/rider?${new URLSearchParams({ ...range, riderId, page: String(page) })}`).then((result) => {
      if (!current) return;
      if (!result.ok) return setMessage(result.message);
      setData(result.data);
      setMessage(result.data.total === 0 ? 'ไม่มีงานของไรเดอร์คนนี้ในช่วงวันที่นี้' : '');
    });
    return () => { current = false; };
  }, [riderId, range, page]);
  useEffect(() => { panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [riderId]);

  const title = data ? `งานของ ${data.rider.displayName}${data.rider.riderCode ? ` (${data.rider.riderCode})` : ''}` : 'งานของไรเดอร์';
  return (
    <div ref={panel}>
      <ReportSection title={title}>
        <div className="panel-head">
          <span className="muted">{data ? `${data.total} งาน` : ''}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={onClose}><Icon name="close" size={18} /> ปิดรายการ</button>
        </div>
        {message && <p aria-live="polite">{message}</p>}
        {data && data.items.length > 0 && (
          <>
            <table className="rider-jobs">
              <thead><tr><th>พัสดุ</th><th>ผู้ป่วย</th><th>โซน</th><th>รับงาน</th><th>ส่งเสร็จ/ไม่สำเร็จ</th><th>สถานะ</th><th className="num">เวลาส่ง</th><th /></tr></thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.packageCode}</code></td>
                    <td>{item.patientName}<br /><code>{item.hn}</code></td>
                    <td>{item.zone}</td>
                    <td className="when">{formatThaiDateTime(item.claimedAt)}</td>
                    <td className="when">{formatThaiDateTime(item.finishedAt)}</td>
                    <td>
                      <span className={`chip ${statusTone(item.status)}`}>{statusLabels[item.status]}</span>
                      {item.failureReason && <><br /><small>{failureReasonLabels[item.failureReason as keyof typeof failureReasonLabels] ?? item.failureReason}</small></>}
                    </td>
                    <td className="num">{minutes(item.minutes)}</td>
                    <td>{item.hasEvidence && <a className="btn btn-secondary btn-small" href={withBasePath(`/api/rider/attempts/${item.id}/evidence`)} target="_blank" rel="noreferrer"><Icon name="image" size={18} /> ดูรูป</a>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.pages > 1 && (
              <nav className="pager" aria-label="หน้ารายการงาน">
                <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
                <span>หน้า {data.page} / {data.pages}</span>
                <button type="button" className="btn btn-secondary btn-small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
              </nav>
            )}
          </>
        )}
      </ReportSection>
    </div>
  );
}
