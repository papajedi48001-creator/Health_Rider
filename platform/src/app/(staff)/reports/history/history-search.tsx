'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PersonName } from '@/account/person-name';
import { DeliveryDetails } from '@/app/(staff)/operations/delivery-details';
import { Icon } from '@/brand/icons';
import { deliveryAttemptStatuses, type DeliveryAttemptStatus } from '@/domain/delivery/status';
import { callApi } from '@/lib/api-client';
import { withBasePath } from '@/lib/base-path';
import { formatThaiDateTime, statusLabels } from '@/lib/labels';
import { statusTone } from '@/lib/status-tone';
import { ReportFilters, type Range } from '@/reports/report-kit';
import { bangkokDateString } from '@/lib/time';
import { SuggestBox, type Suggestion } from './suggest-box';

type Zone = { id: string; subdistrictCode: string; subdistrictName: string | null; villageCode: string; displayName: string };
type Filters = { hn: string; rider: string; subdistrict: string; zone: string; status: string };
type HistoryItem = {
  id: string; packageCode: string; status: DeliveryAttemptStatus; hn: string; patientName: string; subdistrict: string; zone: string;
  rider: { id: string; displayName: string; avatarUpdatedAt: string | null; riderCode: string | null } | null;
  createdAt: string; finishedAt: string | null;
};
type RiderOption = { id: string; displayName: string; riderCode: string };
type PatientOption = { hn: string; patientName: string };
type HistoryPage = { page: number; pages: number; total: number; items: HistoryItem[] };

const maxSuggestions = 8;
const emptyFilters: Filters = { hn: '', rider: '', subdistrict: '', zone: '', status: '' };

function thisMonth(): Range {
  const today = bangkokDateString(new Date());
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export function DeliveryHistorySearch() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [riders, setRiders] = useState<RiderOption[]>([]);
  const [range, setRange] = useState<Range>(thisMonth);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  // Only the filters of the last search are sent, so typing does not reload the table on every key.
  const [applied, setApplied] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<HistoryPage | null>(null);
  const [message, setMessage] = useState('กำลังค้นหา');
  const [detailsOf, setDetailsOf] = useState<string | null>(null);

  useEffect(() => {
    void callApi<{ zones: Zone[] }>('/api/reports/history/zones').then((result) => { if (result.ok) setZones(result.data.zones); });
    void callApi<{ riders: RiderOption[] }>('/api/reports/history/riders').then((result) => { if (result.ok) setRiders(result.data.riders); });
  }, []);

  const query = useMemo(() => new URLSearchParams({ ...range, ...applied, page: String(page) }), [range, applied, page]);
  useEffect(() => {
    let current = true;
    setMessage('กำลังค้นหา');
    void callApi<HistoryPage>(`/api/reports/history?${query}`).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setData(null);
        return setMessage(result.message);
      }
      setData(result.data);
      setMessage(result.data.total === 0 ? 'ไม่พบงานส่งที่ตรงกับเงื่อนไข' : '');
    });
    return () => { current = false; };
  }, [query]);

  // Patients come from the server as they are typed, and only those who have had a delivery.
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const patientText = draft.hn.trim();
  useEffect(() => {
    if (!patientText) return setPatients([]);
    let current = true;
    const timer = setTimeout(() => {
      void callApi<{ patients: PatientOption[] }>(`/api/reports/history/patients?${new URLSearchParams({ q: patientText })}`)
        .then((result) => { if (current && result.ok) setPatients(result.data.patients); });
    }, 250);
    return () => { current = false; clearTimeout(timer); };
  }, [patientText]);
  const patientSuggestions: Suggestion[] = patients.map((patient) => ({ key: patient.hn, value: patient.hn, label: patient.patientName }));

  const riderText = draft.rider.trim().toLowerCase();
  const riderSuggestions: Suggestion[] = riders
    .filter((rider) => rider.riderCode.toLowerCase().includes(riderText) || rider.displayName.toLowerCase().includes(riderText))
    .slice(0, maxSuggestions)
    .map((rider) => ({ key: rider.id, value: rider.riderCode, label: rider.displayName }));

  const subdistricts = useMemo(() => {
    const seen = new Map<string, string>();
    for (const zone of zones) if (!seen.has(zone.subdistrictCode)) seen.set(zone.subdistrictCode, zone.subdistrictName ?? zone.subdistrictCode);
    return [...seen].map(([code, name]) => ({ code, name }));
  }, [zones]);
  const zoneChoices = draft.subdistrict ? zones.filter((zone) => zone.subdistrictCode === draft.subdistrict) : zones;

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setApplied({ ...draft, hn: draft.hn.trim(), rider: draft.rider.trim() });
  }

  function clear() {
    setDraft(emptyFilters);
    setApplied(emptyFilters);
    setPage(1);
  }

  const csvParams = new URLSearchParams({ ...range, ...applied, format: 'csv' });
  return (
    <div>
      <ReportFilters range={range} onChange={(next) => { setRange(next); setPage(1); }} csvHref={withBasePath(`/api/reports/history?${csvParams}`)} />
      <form className="filter-bar history-filters" aria-label="ค้นหาประวัติการส่ง" onSubmit={search}>
        <label>HN หรือชื่อผู้ป่วย <SuggestBox value={draft.hn} onChange={(hn) => setDraft({ ...draft, hn })} suggestions={patientSuggestions} listLabel="ผู้ป่วยที่ตรงกัน" /></label>
        <label>รหัสหรือชื่อไรเดอร์ <SuggestBox value={draft.rider} onChange={(rider) => setDraft({ ...draft, rider })} suggestions={riderSuggestions} listLabel="ไรเดอร์ที่ตรงกัน" /></label>
        <label>
          ตำบล
          <select value={draft.subdistrict} onChange={(event) => setDraft({ ...draft, subdistrict: event.target.value, zone: '' })}>
            <option value="">ทุกตำบล</option>
            {subdistricts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
          </select>
        </label>
        <label>
          โซนหมู่บ้าน
          <select value={draft.zone} onChange={(event) => setDraft({ ...draft, zone: event.target.value })}>
            <option value="">ทุกโซน</option>
            {zoneChoices.map((zone) => <option key={zone.id} value={zone.id}>{zone.displayName}</option>)}
          </select>
        </label>
        <label>
          สถานะ
          <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
            <option value="">ทุกสถานะ</option>
            {deliveryAttemptStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <div className="history-actions">
          <button type="submit">ค้นหา</button>
          <button type="button" className="btn btn-secondary" onClick={clear}>ล้างตัวกรอง</button>
        </div>
      </form>
      <p aria-live="polite">{message || (data && `พบ ${data.total} งาน`)}</p>
      {data && data.items.length > 0 && (
        <>
          <table aria-label="ผลการค้นหา">
            <thead><tr><th>พัสดุ</th><th>ผู้ป่วย</th><th>ตำบล / โซน</th><th>ไรเดอร์</th><th>สถานะ</th><th>เวลา</th><th /></tr></thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.packageCode}</code></td>
                  <td>{item.patientName}<br /><code>{item.hn}</code></td>
                  <td>{item.subdistrict}<br /><span className="muted">{item.zone}</span></td>
                  <td>{item.rider ? <><PersonName person={item.rider} />{item.rider.riderCode && <><br /><code>{item.rider.riderCode}</code></>}</> : '-'}</td>
                  <td><span className={`chip ${statusTone(item.status)}`}>{statusLabels[item.status]}</span></td>
                  <td className="when">
                    เตรียม {formatThaiDateTime(item.createdAt)}
                    {item.finishedAt && <><br />เสร็จ {formatThaiDateTime(item.finishedAt)}</>}
                  </td>
                  <td className="row-actions">
                    <button type="button" className="icon-button info-button" aria-label={`ดูรายละเอียดการส่ง ${item.patientName}`} title="ดูรายละเอียด" onClick={() => setDetailsOf(item.id)}>
                      <Icon name="info" size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.pages > 1 && (
            <nav className="pager" aria-label="หน้าผลการค้นหา">
              <button type="button" className="btn btn-secondary btn-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
              <span>หน้า {data.page} / {data.pages}</span>
              <button type="button" className="btn btn-secondary btn-small" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
            </nav>
          )}
        </>
      )}
      {detailsOf && <DeliveryDetails attemptId={detailsOf} onClose={() => setDetailsOf(null)} />}
    </div>
  );
}
