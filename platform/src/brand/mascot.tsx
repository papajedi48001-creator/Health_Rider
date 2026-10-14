// "น้องไรด์", the Health Rider mascot: a smiling rider on a teal-and-white scooter with the medicine box.
const sources = {
  full: { webp: '/brand/mascot.webp', png: '/brand/mascot.png', ratio: 1224 / 938 },
  small: { webp: '/brand/mascot-small.webp', png: '/brand/mascot-small.png', ratio: 1224 / 938 },
  face: { webp: '/brand/mascot-face.webp', png: '/brand/mascot-face.png', ratio: 1 },
} as const;

export const mascotName = 'น้องไรด์';

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
