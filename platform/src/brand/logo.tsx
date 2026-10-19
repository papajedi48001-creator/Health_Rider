// The Health Rider mark, taken from the mascot's helmet and medicine box: a home with a heart and a capsule.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="logo-mark">
      <defs>
        <linearGradient id="hr-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00a8b4" />
          <stop offset="1" stopColor="#007f8b" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#hr-logo-fill)" />
      <path d="M24 8.5 40 21.2V37a2.5 2.5 0 0 1-2.5 2.5h-27A2.5 2.5 0 0 1 8 37V21.2z" fill="#ffffff" />
      <path d="M24 36.5c-7-4.6-9.6-7.8-9.6-11.1a4.8 4.8 0 0 1 9.6-1.4 4.8 4.8 0 0 1 9.6 1.4c0 3.3-2.6 6.5-9.6 11.1z" fill="#007f8b" />
      <g transform="translate(24.6 28.4) rotate(-40)">
        <path d="M0-2.7h-3.6a2.7 2.7 0 0 0 0 5.4H0z" fill="#f97316" />
        <path d="M0-2.7h3.6a2.7 2.7 0 0 1 0 5.4H0z" fill="#ffffff" />
      </g>
    </svg>
  );
}

// The hospital name comes from the installed license; installs without one keep the original hospital's name.
export function Brand({ size = 36, hospitalName = 'โรงพยาบาลวาริชภูมิ' }: { size?: number; hospitalName?: string }) {
  return (
    <>
      <LogoMark size={size} />
      <span className="brand-text"><strong>Health Rider</strong><small>{hospitalName}</small></span>
    </>
  );
}
