import type { ReactNode } from 'react';
import { Mascot } from '@/brand/mascot';

// The greeting at the top of a role's first page: the mascot beside a short line about today's work.
export function HeroBanner({ title, text, count }: { title: string; text: ReactNode; count?: ReactNode }) {
  return (
    <section className="hero-banner" aria-label="ทักทาย">
      <Mascot width={120} variant="small" />
      <div className="hero-text">
        <strong>{title}</strong>
        <span>{text}</span>
        {count ? <span className="hero-count">{count}</span> : null}
      </div>
    </section>
  );
}
