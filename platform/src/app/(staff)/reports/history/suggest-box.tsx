'use client';

import { useId, useState, type KeyboardEvent } from 'react';

export type Suggestion = { key: string; value: string; label: string };

// A text box that lists suggestions for what has been typed so far.
// Picking one fills in its value; free text still searches as before.
export function SuggestBox({ value, onChange, suggestions, listLabel }: {
  value: string; onChange: (value: string) => void; suggestions: Suggestion[]; listLabel: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const showing = open && value.trim() !== '' && suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0].value === value);

  function pick(suggestion: Suggestion) {
    onChange(suggestion.value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + suggestions.length) % suggestions.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(suggestions[Math.min(active, suggestions.length - 1)]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className="suggest-box">
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
        <ul id={listId} role="listbox" aria-label={listLabel} className="suggestions">
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // Mouse down fires before the input loses focus, so the pick lands before the list closes.
              onMouseDown={(event) => { event.preventDefault(); pick(suggestion); }}
              onMouseEnter={() => setActive(index)}
            >
              <code>{suggestion.value}</code> {suggestion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
