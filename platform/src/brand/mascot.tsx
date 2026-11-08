import { withBasePath } from '@/lib/base-path';

// "น้องภูไทไรเดอร์", the Health Rider mascot: a smiling rider in a teal helmet giving a thumbs-up and holding the medicine bag.
// Bump `v` whenever the images change: the service worker keeps /brand/ files until their URL changes.
const v = '?v=2';
const sources = {
  full: { webp: withBasePath('/brand/mascot.webp') + v, png: withBasePath('/brand/mascot.png') + v, ratio: 2525 / 2781 },
  small: { webp: withBasePath('/brand/mascot-small.webp') + v, png: withBasePath('/brand/mascot-small.png') + v, ratio: 2525 / 2781 },
  face: { webp: withBasePath('/brand/mascot-face.webp') + v, png: withBasePath('/brand/mascot-face.png') + v, ratio: 1 },
} as const;

export const mascotName = 'น้องภูไทไรเดอร์';

export function Mascot({ width = 220, variant, alt, className }: { width?: number; variant?: keyof typeof sources; alt?: string; className?: string }) {
  const kind = variant ?? (width > 260 ? 'full' : 'small');
  const source = sources[kind];
  return (
    <picture className={`mascot${className ? ` ${className}` : ''}`}>
      <source srcSet={source.webp} type="image/webp" />
      {/* eslint-disable-next-line @next/next/no-img-element -- a static brand image served from /public */}
      <img src={source.png} width={width} height={Math.round(width * source.ratio)} alt={alt ?? ''} aria-hidden={alt ? undefined : true} decoding="async" />
    </picture>
  );
}
