'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/brand/icons';
import { withBasePath } from '@/lib/base-path';

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
            {/* eslint-disable-next-line @next/next/no-img-element -- a small static photo served from public/ */}
            <img className="dev-photo" src={withBasePath('/developer.jpg')} alt="" width={44} height={44} />
            <span><strong>{developer.name}</strong><br /><small className="muted">ผู้พัฒนาระบบ Health Rider</small></span>
            <button type="button" className="icon-button" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          </div>
          <ul className="dev-contacts">
            <li title="โทร"><Icon name="phone" size={18} /><span><span className="sr-only">โทร </span><a href={`tel:${developer.phone}`}>085-228-7387</a></span></li>
            <li title="Facebook"><Icon name="facebook" size={18} /><span><span className="sr-only">Facebook </span><a href={developer.facebook} target="_blank" rel="noreferrer">jacky.hokk</a></span></li>
            <li title="LINE ID"><Icon name="chat" size={18} /><span><span className="sr-only">LINE ID </span>{developer.line}</span></li>
            <li title="อีเมล"><Icon name="mail" size={18} /><span><span className="sr-only">อีเมล </span><a href={`mailto:${developer.email}`}>{developer.email}</a></span></li>
          </ul>
        </div>
      )}
      <button type="button" className="dev-credit-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static photo served from public/ */}
        <img className="dev-photo dev-photo-small" src={withBasePath('/developer.jpg')} alt="" width={20} height={20} /> พัฒนาโดย {developer.name}
      </button>
    </div>
  );
}
