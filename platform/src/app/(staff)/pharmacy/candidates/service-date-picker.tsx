'use client';

import { ThaiDatePicker, type DayMark, type MonthMarks } from '@/brand/thai-date-picker';
import { callApi } from '@/lib/api-client';

type VisitDay = { date: string; visits: number; pending: number };

function markOf(day: VisitDay): DayMark {
  return day.pending > 0
    ? { tone: 'pending', badge: String(day.pending), description: `มีรายการส่งยา ${day.visits} ราย รอยืนยัน ${day.pending} ราย` }
    : { tone: 'done', badge: '✓', description: `มีรายการส่งยา ${day.visits} ราย ยืนยันครบแล้ว` };
}

// Counts are read each time the calendar opens or changes month, so they follow confirmations made meanwhile.
async function loadVisitDays(month: string): Promise<MonthMarks> {
  const result = await callApi<{ days: VisitDay[] }>(`/api/pharmacy/candidates/calendar?month=${month}`);
  if (!result.ok) return { ok: false, notice: 'โหลดวันที่มีรายการส่งยาจาก HOSxP ไม่ได้' };
  return { ok: true, days: new Map(result.data.days.map((day) => [day.date, markOf(day)])) };
}

const legend = (
  <>
    <span className="date-picker-legend"><i className="swatch has-pending" />รอยืนยัน (ตัวเลข = จำนวนราย)</span>
    <span className="date-picker-legend"><i className="swatch has-done" />ยืนยันครบแล้ว</span>
  </>
);

// A service-date picker that marks the days HOSxP has home-delivery items, so pharmacy can see which days need work.
export function ServiceDatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  return (
    <ThaiDatePicker
      label="วันที่รับบริการ"
      value={value}
      onChange={onChange}
      loadMarks={loadVisitDays}
      loadingNotice="กำลังโหลดวันที่มีรายการส่งยา"
      unmarkedDescription="ไม่มีรายการส่งยา"
      legend={legend}
    />
  );
}
