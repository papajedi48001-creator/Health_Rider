import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@/domain/errors';

export const maximumFeedbackPhotoBytes = 1024 * 1024;
const safeId = /^[0-9A-Za-z]{26}$/;

// Screenshots sent with feedback sit beside the delivery evidence, in a "feedback" folder that no attempt id can name.
function photoFile(feedbackId: string): string {
  const root = process.env.EVIDENCE_STORAGE_PATH?.trim();
  if (!root) throw new Error('EVIDENCE_STORAGE_PATH is required to store feedback photos');
  if (!safeId.test(feedbackId)) throw new DomainError('รหัสความคิดเห็นไม่ถูกต้อง', 404);
  return path.join(path.resolve(root), 'feedback', `${feedbackId}.jpg`);
}

/** Checks a base64 JPEG the browser already shrank; call before anything is written. */
export function decodeFeedbackPhoto(base64Jpeg: string): Buffer {
  const data = Buffer.from(base64Jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (data.length === 0 || data.length > maximumFeedbackPhotoBytes) throw new DomainError('รูปต้องมีขนาดไม่เกิน 1 MB');
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new DomainError('รูปต้องเป็นไฟล์ JPEG');
  return data;
}

export async function saveFeedbackPhoto(feedbackId: string, data: Buffer): Promise<void> {
  const file = photoFile(feedbackId);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, data, { mode: 0o600, flag: 'wx' });
}

export async function readFeedbackPhoto(feedbackId: string): Promise<Buffer | null> {
  try {
    return await readFile(photoFile(feedbackId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof DomainError) return null;
    throw error;
  }
}
