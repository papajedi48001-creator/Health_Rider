import type { NextConfig } from 'next';

const development = process.env.NODE_ENV !== 'production';

// Set NEXT_PUBLIC_BASE_PATH (for example /health-rider) when the app is served under a path of a
// larger website. It is fixed at build time, so the image must be built with the same value.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
if (basePath && !/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(basePath)) {
  throw new Error(`NEXT_PUBLIC_BASE_PATH must look like /health-rider (leading slash, no trailing slash), got "${basePath}"`);
}

// Identifies this build; open pages compare it with /api/version to offer a newer one.
const appVersion = process.env.APP_VERSION?.trim() || new Date().toISOString();

// Next.js hydrates with inline scripts and the app uses inline styles, so those stay allowed; everything
// else, including framing by other sites, is limited to this origin. Images include data: and blob:
// for QR labels and camera photos.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath,
  poweredByHeader: false,
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
