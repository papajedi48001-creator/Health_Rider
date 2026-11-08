import { packageQrLifetimeMs } from '@/domain/delivery/package-qr-policy';

// The server stores only a hash of each package QR, so this browser keeps the tokens it issued to reprint a label
// with the same QR. They are dropped once the QR would have expired anyway.
const storageKey = 'health-rider:issued-qr-tokens';

type Kept = Record<string, { token: string; expiresAt: number }>;

function read(now: number): Kept {
  try {
    const kept = JSON.parse(window.localStorage.getItem(storageKey) ?? '{}') as Kept;
    return Object.fromEntries(Object.entries(kept).filter(([, entry]) => entry && typeof entry.token === 'string' && entry.expiresAt > now));
  } catch {
    return {};
  }
}

function write(kept: Kept) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(kept));
  } catch {
    // Private windows or blocked storage: reprinting is simply unavailable on this browser.
  }
}

export function keepIssuedToken(attemptId: string, token: string, now = Date.now()) {
  write({ ...read(now), [attemptId]: { token, expiresAt: now + packageQrLifetimeMs } });
}

export function issuedToken(attemptId: string, now = Date.now()): string | null {
  return read(now)[attemptId]?.token ?? null;
}

export function forgetIssuedToken(attemptId: string, now = Date.now()) {
  const kept = read(now);
  delete kept[attemptId];
  write(kept);
}
