import type { ReactNode } from 'react';
import { Mascot } from '@/brand/mascot';

// The greeting at the top of a role's first page: a short line about today's work, with the mascot on the right.
// `accent` adds a second, teal title line and `large` gives the home page its taller banner.
export function HeroBanner({ title, accent, text, count, large }: { title: string; accent?: string; text: ReactNode; count?: ReactNode; large?: boolean }) {
  return (
    <section className={`hero-banner${large ? ' hero-large' : ''}`} aria-label="ทักทาย">
      <div className="hero-text">
        <strong>{title}{accent ? <span className="hero-accent">{accent}</span> : null}</strong>
        <span>{text}</span>
        {count ? <span className="hero-count">{count}</span> : null}
      </div>
      <Mascot width={large ? 300 : 220} variant={large ? 'full' : 'small'} />
    </section>
  );
}
