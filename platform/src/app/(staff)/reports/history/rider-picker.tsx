'use client';

import { useId, useState, type KeyboardEvent } from 'react';

export type RiderOption = { id: string; displayName: string; riderCode: string };

const maxSuggestions = 8;

// A text box that suggests riders whose code or name contains what has been typed so far.
// Picking one fills in the rider code, which is unique; free text still searches as before.
export function RiderPicker({ riders, value, onChange }: { riders: RiderOption[]; value: string; onChange: (value: string) => void }) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const typed = value.trim().toLowerCase();
  const matches = typed
    ? riders.filter((rider) => rider.riderCode.toLowerCase().includes(typed) || rider.displayName.toLowerCase().includes(typed)).slice(0, maxSuggestions)
    : [];
  const showing = open && matches.length > 0 && !(matches.length === 1 && matches[0].riderCode === value);

  function pick(rider: RiderOption) {
    onChange(rider.riderCode);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="rider-picker">
      <input
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        aria-controls={listId}
        aria-activedescendant={showing ? `${listId}-${active}` : undefined}
        autoComplete="off"
        onChange={(event) => { onChange(event.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showing && (
        <ul id={listId} role="listbox" aria-label="ไรเดอร์ที่ตรงกัน" className="rider-suggestions">
          {matches.map((rider, index) => (
            <li
              key={rider.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Mouse down fires before the input loses focus, so the pick lands before the list closes.
              onMouseDown={(event) => { event.preventDefault(); pick(rider); }}
              onMouseEnter={() => setActive(index)}
            >
              <code>{rider.riderCode}</code> {rider.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
