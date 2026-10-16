'use client';

import { useEffect, useState } from 'react';
import { UserAvatar } from '@/account/user-avatar';
import type { DeliveryAttemptStatus } from '@/domain/delivery/status';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { employmentLabels, failureReasonLabels, formatThaiDateTime, statusLabels } from '@/lib/labels';
import { statusTone } from '@/lib/status-tone';
import { minutes, type Range } from '@/reports/report-kit';
import { withBasePath } from '@/lib/base-path';

type RiderJobs = {
  rider: { id: string; displayName: string; avatarUpdatedAt: string | null; phone: string | null; riderCode: string | null; employmentCategory: string | null };
  page: number; pages: number; total: number;
  items: Array<{
    id: string; packageCode: string; status: DeliveryAttemptStatus; hn: string; patientName: string; zone: string;
    claimedAt: string | null; finishedAt: string | null; failureReason: string | null; minutes: number | null; hasEvidence: boolean;
  }>;
};

// The pop-up behind a rider's name in the delivery report: who the rider is, and their jobs in the same date range.
export function RiderJobsPanel({ riderId, range, onClose }: { riderId: string; range: Range; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RiderJobs | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายการงาน');

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
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  const rider = data?.rider;
  const title = rider ? `งานของ ${rider.displayName}${rider.riderCode ? ` (${rider.riderCode})` : ''}` : 'งานของไรเดอร์';
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="photo-viewer-body detail-dialog rider-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="photo-viewer-head">
          <strong>{title}</strong>
          <button type="button" className="icon-button" aria-label="ปิดรายการ" onClick={onClose} autoFocus><Icon name="close" /></button>
        </div>
        {rider && (
          <div className="rider-summary">
            <UserAvatar userId={rider.id} name={rider.displayName} version={rider.avatarUpdatedAt ? Date.parse(rider.avatarUpdatedAt) : null} />
            <dl className="detail-list">
              <dt>ชื่อ</dt><dd>{rider.displayName}</dd>
              {rider.riderCode && <><dt>รหัสไรเดอร์</dt><dd><code>{rider.riderCode}</code></dd></>}
              {rider.employmentCategory && <><dt>ประเภท</dt><dd>{employmentLabels[rider.employmentCategory] ?? rider.employmentCategory}</dd></>}
              <dt>โทรศัพท์</dt><dd>{rider.phone ? <a href={`tel:${rider.phone}`}>{rider.phone}</a> : '-'}</dd>
              <dt>งานในช่วงนี้</dt><dd>{data.total} งาน</dd>
            </dl>
          </div>
        )}
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
      </div>
    </div>
  );
}
