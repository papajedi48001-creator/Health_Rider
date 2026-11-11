'use client';

import { useEffect, useState } from 'react';

// Pixels from either end within which the matching button hides.
const edge = 120;

type Reach = { up: boolean; down: boolean };

function measure(): Reach {
  const root = document.documentElement;
  const max = root.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  return { up: y > edge, down: max - y > edge };
}

function jump(top: number) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top, behavior: reduce ? 'auto' : 'smooth' });
}

// Round "to top" / "to bottom" buttons at the bottom-right of every page that scrolls.
// Each one shows only while there is somewhere to go in its direction.
export function ScrollJump() {
  const [reach, setReach] = useState<Reach>({ up: false, down: false });

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = measure();
        setReach((prev) => (prev.up === next.up && prev.down === next.down ? prev : next));
      });
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Pages grow after data loads, so watch the content size as well as scrolling.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(document.body);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, []);

  if (!reach.up && !reach.down) return null;

  return (
    <div className="scroll-jump">
      {reach.up && (
        <button type="button" aria-label="กลับบนสุด" title="กลับบนสุด" onClick={() => jump(0)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6" /></svg>
        </button>
      )}
      {reach.down && (
        <button type="button" aria-label="ลงล่างสุด" title="ลงล่างสุด" onClick={() => jump(document.documentElement.scrollHeight)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}
    </div>
  );
}
