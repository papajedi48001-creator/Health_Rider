import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Encrypts a stored secret (such as the HOSxP password) with a key derived from AUTH_SECRET.
// Changing AUTH_SECRET makes stored secrets unreadable, so they have to be entered again.
const version = 'v1';

function keyFrom(authSecret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', authSecret, 'health-rider', 'system-settings', 32));
}

export function sealSecret(plain: string, authSecret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(authSecret), iv);
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${version}:${Buffer.concat([iv, cipher.getAuthTag(), sealed]).toString('base64')}`;
}

/** Returns null when the value was sealed with another AUTH_SECRET or is damaged. */
export function openSecret(value: string, authSecret: string): string | null {
  const [prefix, body] = value.split(':', 2);
  if (prefix !== version || !body) return null;
  const bytes = Buffer.from(body, 'base64');
  if (bytes.length < 28) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyFrom(authSecret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
