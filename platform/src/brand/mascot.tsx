// "น้องไรด์", the Health Rider mascot: a smiling rider in a teal helmet carrying a medicine box on a scooter.
export function Mascot({ width = 220, title }: { width?: number; title?: string }) {
  return (
    <svg width={width} height={(width * 200) / 240} viewBox="0 0 240 200" className="mascot" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <ellipse cx="124" cy="186" rx="96" ry="8" fill="#0f766e" opacity="0.12" />
      <path d="M8 104h26M2 120h30M12 136h20" stroke="#14b8a6" strokeWidth="5" strokeLinecap="round" opacity="0.45" />

      {/* Scooter */}
      <path d="M46 152c0-26 20-38 52-34l20 24-64 14z" fill="#14b8a6" />
      <rect x="78" y="138" width="88" height="14" rx="7" fill="#0f766e" />
      <path d="M154 148l14-62h12l-10 64z" fill="#0f766e" />
      <path d="M160 86l30-6" stroke="#17313a" strokeWidth="6" strokeLinecap="round" />
      <circle cx="186" cy="102" r="7" fill="#fde68a" stroke="#0f766e" strokeWidth="3" />
      <path d="M158 156a26 26 0 0 1 48-4" stroke="#14b8a6" strokeWidth="8" fill="none" strokeLinecap="round" />
      <circle cx="70" cy="162" r="21" fill="#17313a" />
      <circle cx="70" cy="162" r="9" fill="#e2e8f0" />
      <circle cx="182" cy="162" r="21" fill="#17313a" />
      <circle cx="182" cy="162" r="9" fill="#e2e8f0" />

      {/* Medicine box */}
      <rect x="34" y="78" width="50" height="40" rx="7" fill="#ffffff" stroke="#0f766e" strokeWidth="3.5" />
      <path d="M55 88h8v7h7v8h-7v7h-8v-7h-7v-8h7z" fill="#ef4444" />

      {/* Rider */}
      <path d="M112 122l30 18" stroke="#17313a" strokeWidth="13" strokeLinecap="round" />
      <ellipse cx="150" cy="142" rx="11" ry="6" fill="#17313a" />
      <path d="M96 124c-3-26 10-40 28-40s30 14 26 40z" fill="#0f766e" />
      <path d="M112 86l12 12 12-12" stroke="#ffffff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 100q16-2 26-14" stroke="#0f766e" strokeWidth="11" fill="none" strokeLinecap="round" />
      <circle cx="167" cy="85" r="6.5" fill="#fcd9b6" />
      <circle cx="124" cy="62" r="23" fill="#fcd9b6" />
      <path d="M99 62a25 25 0 0 1 50 0z" fill="#14b8a6" />
      <path d="M99 62h50" stroke="#0f766e" strokeWidth="5" strokeLinecap="round" />
      <path d="M121 42h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#ffffff" />
      <circle cx="116" cy="72" r="3" fill="#17313a" />
      <circle cx="133" cy="72" r="3" fill="#17313a" />
      <circle cx="117" cy="71" r="1" fill="#ffffff" />
      <circle cx="134" cy="71" r="1" fill="#ffffff" />
      <path d="M118 79q6.5 6 13 0" stroke="#17313a" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <circle cx="110" cy="78" r="3.6" fill="#fb7185" opacity="0.55" />
      <circle cx="139" cy="78" r="3.6" fill="#fb7185" opacity="0.55" />
    </svg>
  );
}
