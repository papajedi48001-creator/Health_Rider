'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { callApi } from '@/lib/api-client';
import { failureReasonLabels } from '@/lib/labels';
import { bangkokDateString } from '@/lib/time';
import { Icon, type IconName } from '@/brand/icons';
import { EmptyState } from '@/brand/empty-state';

export type Range = { from: string; to: string };

const dayMs = 24 * 60 * 60 * 1000;

function presets(now = new Date()): Array<{ label: string; range: Range }> {
  const today = bangkokDateString(now);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = bangkokDateString(new Date(new Date(`${monthStart}T00:00:00+07:00`).getTime() - dayMs));
  return [
    { label: 'วันนี้', range: { from: today, to: today } },
    { label: '7 วันล่าสุด', range: { from: bangkokDateString(new Date(now.getTime() - 6 * dayMs)), to: today } },
    { label: 'เดือนนี้', range: { from: monthStart, to: today } },
    { label: 'เดือนก่อน', range: { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd } },
  ];
}

// Loads one report for a date range; starts on the current month like the API's default.
export function useReport<T>(endpoint: string) {
  const [range, setRange] = useState<Range>(() => presets()[2].range);
  const [data, setData] = useState<T | null>(null);
  const [message, setMessage] = useState('กำลังโหลดรายงาน');

  const load = useCallback(async () => {
    setMessage('กำลังโหลดรายงาน');
    const result = await callApi<T>(`${endpoint}?${new URLSearchParams(range)}`);
    if (!result.ok) {
      setData(null);
      return setMessage(result.message);
    }
    setData(result.data);
    setMessage('');
  }, [endpoint, range]);

  useEffect(() => { void load(); }, [load]);

  return { range, setRange, data, message, csvHref: `${endpoint}?${new URLSearchParams({ ...range, format: 'csv' })}` };
}

export function ReportFilters({ range, onChange, csvHref }: { range: Range; onChange: (range: Range) => void; csvHref: string }) {
  return (
    <form aria-label="ช่วงวันที่ของรายงาน" className="filter-bar report-filters" onSubmit={(event) => event.preventDefault()}>
      <label>ตั้งแต่วันที่ <input type="date" value={range.from} max={range.to} onChange={(event) => event.target.value && onChange({ ...range, from: event.target.value })} /></label>
      <label>ถึงวันที่ <input type="date" value={range.to} min={range.from} onChange={(event) => event.target.value && onChange({ ...range, to: event.target.value })} /></label>
      <div className="preset-row" role="group" aria-label="ช่วงเวลาที่ใช้บ่อย">
        {presets().map((preset) => (
          <button key={preset.label} type="button" className={`btn btn-secondary btn-small${preset.range.from === range.from && preset.range.to === range.to ? ' is-active' : ''}`} onClick={() => onChange(preset.range)}>
            {preset.label}
          </button>
        ))}
        <a className="btn btn-primary btn-small" href={csvHref} download><Icon name="download" size={18} /> ดาวน์โหลด CSV</a>
      </div>
    </form>
  );
}

export function StatTile({ icon, value, label, tone }: { icon: IconName; value: ReactNode; label: string; tone?: 'success' | 'danger' | 'warning' | 'info' }) {
  return (
    <span className={`stat${tone ? ` chip-${tone}` : ''}`}>
      <span className="stat-icon"><Icon name={icon} size={22} /></span>
      <span className="stat-body"><strong>{value}</strong>{label}</span>
    </span>
  );
}

export function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="report-section" aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function percent(value: number | null): string {
  return value === null ? '-' : `${value}%`;
}

export function minutes(value: number | null): string {
  return value === null ? '-' : `${value} นาที`;
}

export function baht(satang: number): string {
  return (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function thaiDate(date: string): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(`${date}T12:00:00+07:00`));
}

export function FailureReasons({ reasons }: { reasons: Array<{ reason: string; count: number }> }) {
  if (reasons.length === 0) return <p className="muted">ไม่มีงานที่ส่งไม่สำเร็จในช่วงนี้</p>;
  const total = reasons.reduce((sum, row) => sum + row.count, 0);
  return (
    <table>
      <thead><tr><th>สาเหตุ</th><th className="num">จำนวน</th><th className="num">สัดส่วน</th></tr></thead>
      <tbody>
        {reasons.map((row) => (
          <tr key={row.reason}>
            <td>{failureReasonLabels[row.reason as keyof typeof failureReasonLabels] ?? row.reason}</td>
            <td className="num">{row.count}</td>
            <td className="num">{Math.round((row.count / total) * 100)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function NoActivity() {
  return <EmptyState text="ยังไม่มีงานในช่วงวันที่นี้ ลองเลือกช่วงวันที่อื่น" />;
}
