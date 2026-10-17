'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '@/brand/icons';
import { callApi } from '@/lib/api-client';
import { bangkokDateString } from '@/lib/time';

type VisitDay = { date: string; visits: number; pending: number };

const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const shortMonthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const weekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const thaiYear = (year: number) => year + 543;
const pad = (value: number) => String(value).padStart(2, '0');

function thaiShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${shortMonthNames[month - 1]} ${thaiYear(year)}`;
}

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, index - 1 + by, 1));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

// Leading blanks for the weekday the month starts on, then each day of the month.
function monthCells(month: string): (string | null)[] {
  const [year, index] = month.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, index - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: days }, (_, day) => `${month}-${pad(day + 1)}`)];
}

function describeDay(date: string, day: VisitDay | undefined): string {
  const [year, month, dayOfMonth] = date.split('-').map(Number);
  const name = `${dayOfMonth} ${monthNames[month - 1]} ${thaiYear(year)}`;
  if (!day) return `${name} ไม่มีรายการส่งยา`;
  return day.pending > 0 ? `${name} มีรายการส่งยา ${day.visits} ราย รอยืนยัน ${day.pending} ราย` : `${name} มีรายการส่งยา ${day.visits} ราย ยืนยันครบแล้ว`;
}

// A service-date picker that marks the days HOSxP has home-delivery items, so pharmacy can see which days need work.
export function ServiceDatePicker({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const labelId = useId();
  const dialogId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [days, setDays] = useState<Map<string, VisitDay>>(new Map());
  const [notice, setNotice] = useState('');
  const today = bangkokDateString(new Date());

  // Counts are read each time the calendar opens or changes month, so they follow confirmations made meanwhile.
  useEffect(() => {
    if (!open) return;
    let current = true;
    setNotice('กำลังโหลดวันที่มีรายการส่งยา');
    void callApi<{ days: VisitDay[] }>(`/api/pharmacy/candidates/calendar?month=${month}`).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setDays(new Map());
        return setNotice('โหลดวันที่มีรายการส่งยาจาก HOSxP ไม่ได้');
      }
      setDays(new Map(result.data.days.map((day) => [day.date, day])));
      setNotice('');
    });
    return () => { current = false; };
  }, [open, month]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  function toggle() {
    if (!open) setMonth(value.slice(0, 7));
    setOpen(!open);
  }

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  const [year, monthIndex] = month.split('-').map(Number);
  return (
    <div className="date-picker" ref={wrapper}>
      <span id={labelId} className="date-picker-label">วันที่รับบริการ</span>
      <button
        type="button"
        className="date-picker-trigger"
        aria-labelledby={`${labelId} ${labelId}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <span id={`${labelId}-value`}>{thaiShortDate(value)}</span>
        <Icon name="calendar" size={18} />
      </button>
      {open && (
        <div id={dialogId} role="dialog" aria-label="เลือกวันที่รับบริการ" className="date-picker-popover">
          <div className="date-picker-head">
            <button type="button" className="icon-button" aria-label="เดือนก่อน" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" size={18} /></button>
            <strong>{monthNames[monthIndex - 1]} {thaiYear(year)}</strong>
            <button type="button" className="icon-button" aria-label="เดือนถัดไป" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={18} /></button>
          </div>
          <div className="date-picker-grid">
            {weekdays.map((weekday) => <span key={weekday} className="date-picker-weekday" aria-hidden="true">{weekday}</span>)}
            {monthCells(month).map((date, index) => {
              if (!date) return <span key={`blank-${index}`} />;
              const day = days.get(date);
              const tone = !day ? '' : day.pending > 0 ? ' has-pending' : ' has-done';
              return (
                <button
                  key={date}
                  type="button"
                  className={`date-picker-day${tone}${date === today ? ' is-today' : ''}`}
                  aria-pressed={date === value}
                  aria-label={describeDay(date, day)}
                  title={describeDay(date, day)}
                  onClick={() => pick(date)}
                >
                  <span>{Number(date.slice(8))}</span>
                  {day && <small>{day.pending > 0 ? day.pending : '✓'}</small>}
                </button>
              );
            })}
          </div>
          {notice && <p className="date-picker-notice">{notice}</p>}
          <div className="date-picker-foot">
            <span className="date-picker-legend"><i className="swatch has-pending" />รอยืนยัน (ตัวเลข = จำนวนราย)</span>
            <span className="date-picker-legend"><i className="swatch has-done" />ยืนยันครบแล้ว</span>
            <button type="button" className="link-button" onClick={() => pick(today)}>วันนี้</button>
          </div>
        </div>
      )}
    </div>
  );
}
