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
            <span><strong>{developer.name}</strong><br /><small className="muted">ผู้พัฒนาระบบ ภูไทไรเดอร์</small></span>
            <button type="button" className="icon-button" aria-label="ปิด" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
          </div>
          <ul className="dev-contacts">
            <li title="โทร"><Icon name="phone" size={18} /><span><span className="sr-only">โทร </span><a href={`tel:${developer.phone}`}>085-228-7387</a></span></li>
            <li title="Facebook"><Icon name="facebook" size={18} /><span><span className="sr-only">Facebook </span><a href={developer.facebook} target="_blank" rel="noreferrer">jacky.hokk</a></span></li>
            <li title="LINE ID"><LineLogo /><span><span className="sr-only">LINE ID </span>{developer.line}</span></li>
            <li title="อีเมล"><Icon name="mail" size={18} /><span><span className="sr-only">อีเมล </span><a href={`mailto:${developer.email}`}>{developer.email}</a></span></li>
          </ul>
        </div>
      )}
      <button type="button" className="dev-credit-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="info" size={16} /> พัฒนาโดย {developer.name}
      </button>
    </div>
  );
}

// The LINE logo: a white speech bubble reading LINE on the brand's green square.
function LineLogo() {
  return (
    <svg className="line-logo" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="5.5" fill="#06C755" />
      <path fill="#fff" d="M12 4.6c-4.6 0-8.3 3-8.3 6.7 0 3.3 2.9 6.1 6.9 6.6.3.1.6.2.7.4.1.2.1.5 0 .7l-.1.7c0 .2-.2.8.7.4.9-.4 4.8-2.8 6.5-4.8 1.2-1.3 1.8-2.6 1.8-4 0-3.7-3.7-6.7-8.2-6.7z" />
      <path fill="#06C755" d="M6.6 9.4v3.9h2.2v-.8H7.4V9.4zM9.4 9.4h.8v3.9h-.8zM11 9.4v3.9h.8v-2.4l1.7 2.4h.8V9.4h-.8v2.4l-1.7-2.4zM15.1 9.4v3.9h2.4v-.8h-1.6v-.8h1.6v-.8h-1.6v-.7h1.6v-.8z" />
    </svg>
  );
}
