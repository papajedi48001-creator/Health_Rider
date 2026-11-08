import type { ReactNode } from 'react';
import { Mascot } from '@/brand/mascot';

// The greeting at the top of a role's first page: a short line about today's work, with the mascot on the right.
export function HeroBanner({ title, text, count }: { title: string; text: ReactNode; count?: ReactNode }) {
  return (
    <section className="hero-banner" aria-label="ทักทาย">
      <div className="hero-text">
        <strong>{title}</strong>
        <span>{text}</span>
        {count ? <span className="hero-count">{count}</span> : null}
      </div>
      <Mascot width={220} variant="small" />
    </section>
  );
}
