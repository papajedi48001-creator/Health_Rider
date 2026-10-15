import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const maximumEvidencePhotoBytes = 3 * 1024 * 1024;
const safeSegment = /^[0-9A-Za-z-]{8,64}$/;

export class InvalidEvidencePhotoError extends Error {}

function storageRoot(): string {
  const root = process.env.EVIDENCE_STORAGE_PATH?.trim();
  if (!root) throw new Error('EVIDENCE_STORAGE_PATH is required to store delivery evidence');
  return path.resolve(root);
}

// Accepts a base64 JPEG (the rider app re-encodes photos, which drops EXIF location data) and
// stores it as <attemptId>/<eventUuid>-<sha256>.jpg. The name carries the content hash and the file is
// created exclusively, so a stored photo is never overwritten: a resend with other bytes gets its own file.
export async function saveEvidencePhoto(attemptId: string, eventUuid: string, base64Jpeg: string): Promise<string> {
  if (!safeSegment.test(attemptId) || !safeSegment.test(eventUuid)) throw new InvalidEvidencePhotoError('รหัสงานหรือรหัสเหตุการณ์ไม่ถูกต้อง');
  const data = Buffer.from(base64Jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (data.length === 0 || data.length > maximumEvidencePhotoBytes) throw new InvalidEvidencePhotoError('รูปหลักฐานต้องมีขนาดไม่เกิน 3 MB');
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new InvalidEvidencePhotoError('รูปหลักฐานต้องเป็นไฟล์ JPEG');

  const digest = createHash('sha256').update(data).digest('hex');
  const relativePath = path.join(attemptId, `${eventUuid}-${digest}.jpg`);
  const directory = path.join(storageRoot(), attemptId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(path.join(storageRoot(), relativePath), data, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    // Same name means same bytes, already stored by an earlier attempt to sync this event.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  return relativePath;
}

// Returns null when the path is outside the evidence folder or the file is missing.
export async function readEvidencePhoto(relativePath: string): Promise<Buffer | null> {
  const root = storageRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root + path.sep)) return null;
  try {
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
