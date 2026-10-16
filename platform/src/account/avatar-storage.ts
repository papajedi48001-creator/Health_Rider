import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@/domain/errors';

export const maximumAvatarBytes = 300 * 1024;
const safeUserId = /^[0-9A-Za-z]{8,64}$/;

// Profile photos sit beside the delivery evidence, in an "avatars" folder that no attempt id can name.
function avatarFile(userId: string): string {
  const root = process.env.EVIDENCE_STORAGE_PATH?.trim();
  if (!root) throw new Error('EVIDENCE_STORAGE_PATH is required to store profile photos');
  if (!safeUserId.test(userId)) throw new DomainError('รหัสผู้ใช้ไม่ถูกต้อง');
  return path.join(path.resolve(root), 'avatars', `${userId}.jpg`);
}

/** Accepts a base64 JPEG the browser already cropped and shrank, and replaces the user's photo. */
export async function saveAvatar(userId: string, base64Jpeg: unknown): Promise<void> {
  if (typeof base64Jpeg !== 'string') throw new DomainError('ต้องเลือกรูปโปรไฟล์');
  const data = Buffer.from(base64Jpeg.replace(/^data:image\/jpeg;base64,/, ''), 'base64');
  if (data.length === 0 || data.length > maximumAvatarBytes) throw new DomainError('รูปโปรไฟล์ต้องมีขนาดไม่เกิน 300 KB');
  if (data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) throw new DomainError('รูปโปรไฟล์ต้องเป็นไฟล์ JPEG');
  const file = avatarFile(userId);
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  // Written beside the old photo, then swapped in, so a reader never sees half a file.
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, data, { mode: 0o600 });
  await rename(temporary, file);
}

export async function readAvatar(userId: string): Promise<Buffer | null> {
  try {
    return await readFile(avatarFile(userId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT' || error instanceof DomainError) return null;
    throw error;
  }
}

export async function removeAvatar(userId: string): Promise<void> {
  await rm(avatarFile(userId), { force: true });
}
