'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { deliveryAttemptStatuses, type DeliveryAttemptStatus } from '@/domain/delivery/status';
import { Icon, type IconName } from '@/brand/icons';
import { statusTone } from '@/lib/status-tone';
import { callApi } from '@/lib/api-client';
import { formatThaiDateTime, shortCode, statusLabels } from '@/lib/labels';
import { bangkokDateString } from '@/lib/time';
import { DeliveryDetails } from '@/app/(staff)/operations/delivery-details';

const statusIcons: Record<DeliveryAttemptStatus, IconName> = {
  prepared: 'package', claimed: 'scooter', in_transit: 'truck', delivered: 'checkCircle',
  delivery_failed: 'xCircle', return_required: 'undo', returned: 'checkCircle', sync_review: 'alert',
};

type Attempt = {
  id: string; status: DeliveryAttemptStatus; createdAt: string; deliveredAt: string | null; failedAt: string | null;
  rider: { displayName: string } | null;
  deliveryRequest: { id: string; hn: string; patientName: string; telephone: string | null; deliveryAddress: string; deliveryVersion: number; deliveryZone: { displayName: string } };
};
type Dashboard = { attempts: Attempt[]; zones: Array<{ id: string; displayName: string }> };

const amendableStatuses: DeliveryAttemptStatus[] = ['claimed', 'in_transit', 'sync_review'];

export function OperationsDashboard() {
  const [filters, setFilters] = useState({ date: bangkokDateString(new Date()), status: '', zoneId: '', includeOpen: '1' });
  const [data, setData] = useState<Dashboard | null>(null);
  const [message, setMessage] = useState('กำลังโหลด');
  const [editing, setEditing] = useState<string | null>(null);
  const [detailsOf, setDetailsOf] = useState<string | null>(null);
  const closeDetails = useCallback(() => setDetailsOf(null), []);

  // Status is filtered here rather than on the server, so every status tile keeps its count while one is picked.
  const serverQuery = new URLSearchParams(Object.entries(filters).filter(([key, value]) => value && key !== 'status')).toString();
  const load = useCallback(async () => {
    const result = await callApi<Dashboard>(`/api/operations/dashboard?${serverQuery}`);
    if (!result.ok) return setMessage(result.message);
    setData(result.data);
    setMessage(result.data.attempts.length === 0 ? 'ไม่มีงานตามตัวกรองนี้' : '');
  }, [serverQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function amend(event: FormEvent<HTMLFormElement>, attempt: Attempt) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await callApi(`/api/operations/requests/${attempt.deliveryRequest.id}/amend`, {
      json: {
        deliveryAddress: form.get('deliveryAddress'), telephone: form.get('telephone'), reason: form.get('reason'),
        expectedVersion: attempt.deliveryRequest.deliveryVersion,
      },
    });
    if (!result.ok) return setMessage(result.message);
    setEditing(null);
    await load();
    setMessage('แก้ไขข้อมูลจัดส่งแล้ว ไรเดอร์จะเห็นข้อมูลใหม่เมื่อเปิดงานขณะออนไลน์');
  }

  const counts = data?.attempts.reduce<Record<string, number>>((total, attempt) => ({ ...total, [attempt.status]: (total[attempt.status] ?? 0) + 1 }), {}) ?? {};
  const shown = (data?.attempts ?? []).filter((attempt) => !filters.status || attempt.status === filters.status);

  return (
    <div>
      <form aria-label="ตัวกรอง" className="filter-bar" onSubmit={(event) => event.preventDefault()}>
        <label>วันที่ <input type="date" value={filters.date} onChange={(event) => event.target.value && setFilters({ ...filters, date: event.target.value })} /></label>
        <label>
          สถานะ
          <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
            <option value="">ทั้งหมด</option>
            {deliveryAttemptStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <label>
          โซน
          <select value={filters.zoneId} onChange={(event) => setFilters({ ...filters, zoneId: event.target.value })}>
            <option value="">ทั้งหมด</option>
            {data?.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.displayName}</option>)}
          </select>
        </label>
        <label className="check-label">
          <input type="checkbox" checked={filters.includeOpen === '1'} onChange={(event) => setFilters({ ...filters, includeOpen: event.target.checked ? '1' : '' })} />
          รวมงานที่ยังไม่ปิดจากวันอื่น
        </label>
      </form>
      <p aria-live="polite">{message}</p>
      {data && data.attempts.length > 0 && (
        <>
          <div className="stat-row" role="group" aria-label="กรองตามสถานะ">
            {Object.entries(counts).map(([status, count]) => (
              <button
                key={status}
                type="button"
                className={`stat stat-button ${statusTone(status as DeliveryAttemptStatus)}`}
                aria-pressed={filters.status === status}
                onClick={() => setFilters({ ...filters, status: filters.status === status ? '' : status })}
              >
                <span className="stat-icon"><Icon name={statusIcons[status as DeliveryAttemptStatus]} size={22} /></span>
                <span className="stat-body"><strong>{count}</strong>{statusLabels[status as DeliveryAttemptStatus]}</span>
              </button>
            ))}
          </div>
          {filters.status && (
            <p className="filter-note">
              แสดงเฉพาะ “{statusLabels[filters.status as DeliveryAttemptStatus]}” {shown.length} งาน{' '}
              <button type="button" className="link-button" onClick={() => setFilters({ ...filters, status: '' })}>แสดงทุกสถานะ</button>
            </p>
          )}
          <table>
            <thead><tr><th>พัสดุ</th><th>ผู้ป่วย</th><th>โซน</th><th>ไรเดอร์</th><th>สถานะ</th><th>เวลาล่าสุด</th><th /></tr></thead>
            <tbody>
              {shown.map((attempt) => (
                <tr key={attempt.id}>
                  <td><code>{shortCode(attempt.id)}</code></td>
                  <td>{attempt.deliveryRequest.patientName}<br /><code>{attempt.deliveryRequest.hn}</code></td>
                  <td>{attempt.deliveryRequest.deliveryZone.displayName}</td>
                  <td>{attempt.rider?.displayName ?? '-'}</td>
                  <td><span className={`chip ${statusTone(attempt.status)}`}>{statusLabels[attempt.status]}</span></td>
                  <td>{formatThaiDateTime(attempt.deliveredAt ?? attempt.failedAt ?? attempt.createdAt)}</td>
                  <td className="row-actions">
                    <button type="button" className="icon-button info-button" aria-label={`ดูรายละเอียดการส่ง ${attempt.deliveryRequest.patientName}`} title="ดูรายละเอียด" onClick={() => setDetailsOf(attempt.id)}>
                      <Icon name="info" size={20} />
                    </button>
                    {amendableStatuses.includes(attempt.status) && (editing === attempt.id ? (
                      <form onSubmit={(event) => void amend(event, attempt)} aria-label="แก้ไขข้อมูลระหว่างส่ง">
                        <label>ที่อยู่ <textarea name="deliveryAddress" defaultValue={attempt.deliveryRequest.deliveryAddress} /></label>
                        <label>โทรศัพท์ <input name="telephone" defaultValue={attempt.deliveryRequest.telephone ?? ''} /></label>
                        <label>เหตุผล <input name="reason" required /></label>
                        <button type="submit">บันทึกการแก้ไข</button>
                        <button type="button" onClick={() => setEditing(null)}>ยกเลิก</button>
                      </form>
                    ) : <button type="button" onClick={() => setEditing(attempt.id)}>แก้ที่อยู่/โทรศัพท์</button>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {detailsOf && <DeliveryDetails attemptId={detailsOf} onClose={closeDetails} />}
    </div>
  );
}
