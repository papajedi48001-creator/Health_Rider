'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/brand/icons';

const developer = {
  name: 'Jacky Hokk',
  phone: '0852287387',
  facebook: 'https://www.facebook.com/jacky.hokk',
  line: 'jackyhokk',
  email: 'jackyjacky_kung@hotmail.com',
};

// The developer's credit in the bottom-right corner of every page; tapping it shows how to get in touch.
export function DeveloperCredit() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="dev-credit" ref={root}>
      {open && (
        <div className="dev-balloon" role="dialog" aria-label="ติดต่อผู้พัฒนา">
          <div className="dev-balloon-head">
            <span className="avatar avatar-inline" aria-hidden="true">J</span>
            <span><strong>{developer.name}</strong><br /><small className="muted">ผู้พัฒนาระบบ Health Rider</small></span>
            <button type="button" className="icon-button" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          </div>
          <dl className="detail-list">
            <dt>โทร</dt><dd><a href={`tel:${developer.phone}`}>085-228-7387</a></dd>
            <dt>Facebook</dt><dd><a href={developer.facebook} target="_blank" rel="noreferrer">jacky.hokk</a></dd>
            <dt>LINE ID</dt><dd>{developer.line}</dd>
            <dt>อีเมล</dt><dd><a href={`mailto:${developer.email}`}>{developer.email}</a></dd>
          </dl>
        </div>
      )}
      <button type="button" className="dev-credit-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="info" size={16} /> พัฒนาโดย {developer.name}
      </button>
    </div>
  );
}
