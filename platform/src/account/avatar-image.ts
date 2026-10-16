const avatarEdge = 320;

// Crops the middle square of a picked photo and re-encodes it as a small JPEG, which also drops EXIF data.
export async function toAvatarJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = avatarEdge;
  canvas.height = avatarEdge;
  canvas.getContext('2d')?.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, avatarEdge, avatarEdge);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
