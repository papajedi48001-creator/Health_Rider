// The Health Rider mark: a map pin carrying a medical cross, with speed lines for delivery to the door.
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 48 48" className="logo-mark">
      <defs>
        <linearGradient id="hr-logo-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#14b8a6" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#hr-logo-fill)" />
      <path d="M6 19h7M4 25h8M7 31h5" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M28 8.5a11.5 11.5 0 0 1 11.5 11.5c0 8.6-11.5 19.5-11.5 19.5S16.5 28.6 16.5 20A11.5 11.5 0 0 1 28 8.5z" fill="#ffffff" />
      <path d="M26 14.5h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#0f766e" />
    </svg>
  );
}

export function Brand({ size = 36 }: { size?: number }) {
  return (
    <>
      <LogoMark size={size} />
      <span className="brand-text"><strong>Health Rider</strong><small>โรงพยาบาลวาริชภูมิ</small></span>
    </>
  );
}
