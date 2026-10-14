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
// stores it as <attemptId>/<eventUuid>.jpg. Writing again with the same names is idempotent.
export async function saveEvidencePhoto(attemptId: string, eventUuid: string, base64Jpeg: string): Promise<string> {
  if (!safeSegment.test(attemptId) || !safeSegment.test(eventUuid)) throw new InvalidEvidencePhotoError('รหัสงานหรือรหัสเหตุการณ์ไม่ถูกต้อง');
  const data = Buffer.from(base64Jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (data.length === 0 || data.length > maximumEvidencePhotoBytes) throw new InvalidEvidencePhotoError('รูปหลักฐานต้องมีขนาดไม่เกิน 3 MB');
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new InvalidEvidencePhotoError('รูปหลักฐานต้องเป็นไฟล์ JPEG');

  const relativePath = path.join(attemptId, `${eventUuid}.jpg`);
  const directory = path.join(storageRoot(), attemptId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(path.join(storageRoot(), relativePath), data, { mode: 0o600 });
  return relativePath;
}

export async function readEvidencePhoto(relativePath: string): Promise<Buffer> {
  const root = storageRoot();
  const absolute = path.resolve(root, relativePath);
  if (!absolute.startsWith(root + path.sep)) throw new InvalidEvidencePhotoError('ตำแหน่งไฟล์หลักฐานไม่ถูกต้อง');
  return readFile(absolute);
}
