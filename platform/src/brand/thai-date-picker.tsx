'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/brand/icons';
import { bangkokDateString } from '@/lib/time';

const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const shortMonthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const weekdays = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const thaiYear = (year: number) => year + 543;
const pad = (value: number) => String(value).padStart(2, '0');
const isDate = (value: string | undefined): value is string => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

/** "2026-11-13" → "13 พ.ย. 2569" */
export function thaiShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${shortMonthNames[month - 1]} ${thaiYear(year)}`;
}

/** "2026-11-13" → "13 พฤศจิกายน 2569" */
export function thaiLongDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${monthNames[month - 1]} ${thaiYear(year)}`;
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

/** How one day is marked on the calendar, for pickers that show where the work is. */
export type DayMark = { tone: 'pending' | 'done'; badge: string; description: string };
export type MonthMarks = { ok: true; days: Map<string, DayMark> } | { ok: false; notice: string };

type Props = {
  /** Visible label, also the start of the trigger's accessible name. */
  label: string;
  /** Date as YYYY-MM-DD, the same value a native date input gives the backend. */
  value: string;
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  /** Submits the value with the surrounding form under this name, like a native input. */
  name?: string;
  /** Reads the marks of one month each time the calendar opens or changes month. Keep it stable. */
  loadMarks?: (month: string) => Promise<MonthMarks>;
  loadingNotice?: string;
  /** Read out for a day with no mark, once marks have loaded. */
  unmarkedDescription?: string;
  legend?: ReactNode;
};

// A date picker that shows and picks dates the Thai way ("13 พ.ย. 2569", Buddhist-era years), whatever the browser's locale.
export function ThaiDatePicker({ label, value, onChange, min, max, name, loadMarks, loadingNotice = 'กำลังโหลด', unmarkedDescription, legend }: Props) {
  const labelId = useId();
  const dialogId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const today = bangkokDateString(new Date());
  const start = isDate(value) ? value : today;
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(start.slice(0, 7));
  const [marks, setMarks] = useState<Map<string, DayMark>>(new Map());
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!open || !loadMarks) return;
    let current = true;
    setNotice(loadingNotice);
    void loadMarks(month).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setMarks(new Map());
        return setNotice(result.notice);
      }
      setMarks(result.days);
      setNotice('');
    });
    return () => { current = false; };
  }, [open, month, loadMarks, loadingNotice]);

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

  const outOfRange = (date: string) => (isDate(min) && date < min) || (isDate(max) && date > max);

  function toggle() {
    if (!open) setMonth(start.slice(0, 7));
    setOpen(!open);
  }

  function pick(date: string) {
    onChange(date);
    setOpen(false);
  }

  const [year, monthIndex] = month.split('-').map(Number);
  const canGoBack = !isDate(min) || shiftMonth(month, -1) >= min.slice(0, 7);
  const canGoForward = !isDate(max) || shiftMonth(month, 1) <= max.slice(0, 7);
  return (
    <div className="date-picker" ref={wrapper}>
      <span id={labelId} className="date-picker-label">{label}</span>
      <button
        type="button"
        className="date-picker-trigger"
        aria-labelledby={`${labelId} ${labelId}-value`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={toggle}
      >
        <span id={`${labelId}-value`}>{isDate(value) ? thaiShortDate(value) : 'เลือกวันที่'}</span>
        <Icon name="calendar" size={18} />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {open && (
        <div id={dialogId} role="dialog" aria-label={`เลือก${label}`} className="date-picker-popover">
          <div className="date-picker-head">
            <button type="button" className="icon-button" aria-label="เดือนก่อน" disabled={!canGoBack} onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="back" size={18} /></button>
            <strong>{monthNames[monthIndex - 1]} {thaiYear(year)}</strong>
            <button type="button" className="icon-button" aria-label="เดือนถัดไป" disabled={!canGoForward} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={18} /></button>
          </div>
          <div className="date-picker-grid">
            {weekdays.map((weekday) => <span key={weekday} className="date-picker-weekday" aria-hidden="true">{weekday}</span>)}
            {monthCells(month).map((date, index) => {
              if (!date) return <span key={`blank-${index}`} />;
              const mark = marks.get(date);
              const extra = mark?.description ?? (loadMarks ? unmarkedDescription : undefined);
              const description = extra ? `${thaiLongDate(date)} ${extra}` : thaiLongDate(date);
              return (
                <button
                  key={date}
                  type="button"
                  className={`date-picker-day${mark ? ` has-${mark.tone}` : ''}${date === today ? ' is-today' : ''}`}
                  aria-pressed={date === value}
                  aria-label={description}
                  title={description}
                  disabled={outOfRange(date)}
                  onClick={() => pick(date)}
                >
                  <span>{Number(date.slice(8))}</span>
                  {mark && <small>{mark.badge}</small>}
                </button>
              );
            })}
          </div>
          {notice && <p className="date-picker-notice">{notice}</p>}
          <div className="date-picker-foot">
            {legend}
            <button type="button" className="link-button" disabled={outOfRange(today)} onClick={() => pick(today)}>วันนี้</button>
          </div>
        </div>
      )}
    </div>
  );
}
