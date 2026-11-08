import { createHash, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// The host's machine ID, which compose.production.yaml mounts read-only. Missing (development, tests) reads as
// empty, so the ID then rests on the stored secret alone.
const machineIdPaths = ['/etc/host-machine-id', '/etc/machine-id'];

export async function readMachineId(paths = machineIdPaths): Promise<string> {
  for (const file of paths) {
    try {
      const value = (await readFile(file, 'utf8')).trim();
      if (value) return value;
    } catch {
      // Try the next place.
    }
  }
  return '';
}

export function newInstallationSecret(): string {
  return randomBytes(32).toString('hex');
}

// HR-XXXX-XXXX-XXXX from the secret stored in this install's database and the host it runs on: a copy of the
// database on another server, or this server with a fresh database, gets another ID, so its key no longer fits.
export function installationIdFor(secret: string, machineId: string): string {
  const digest = createHash('sha256').update(`health-rider|${secret}|${machineId}`).digest();
  let bits = 0n;
  for (const byte of digest.subarray(0, 8)) bits = (bits << 8n) | BigInt(byte);
  let text = '';
  for (let index = 0; index < 12; index += 1) text += crockford.charAt(Number((bits >> BigInt(59 - index * 5)) & 31n));
  return `HR-${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`;
}
