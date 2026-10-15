import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readEvidencePhoto, saveEvidencePhoto } from '@/evidence/photo-storage';

const attemptId = '01JABCDEFGHJKMNPQRSTVWXYZ0';
const eventUuid = '11111111-1111-4111-8111-111111111111';
const jpeg = (marker: number) => Buffer.from([0xff, 0xd8, 0xff, marker, 0xff, 0xd9]).toString('base64');
let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'evidence-'));
  vi.stubEnv('EVIDENCE_STORAGE_PATH', root);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

test('never overwrites a stored photo when the same event is sent again with other bytes', async () => {
  const first = await saveEvidencePhoto(attemptId, eventUuid, jpeg(0xe0));
  const again = await saveEvidencePhoto(attemptId, eventUuid, jpeg(0xe0));
  const replaced = await saveEvidencePhoto(attemptId, eventUuid, jpeg(0xe1));

  expect(again).toBe(first);
  expect(replaced).not.toBe(first);
  expect(await readFile(path.join(root, first))).toEqual(Buffer.from(jpeg(0xe0), 'base64'));
  expect(await readdir(path.join(root, attemptId))).toHaveLength(2);
});

test('reads nothing outside the evidence folder or for a missing file', async () => {
  await expect(readEvidencePhoto('../outside.jpg')).resolves.toBeNull();
  await expect(readEvidencePhoto(`${attemptId}/missing.jpg`)).resolves.toBeNull();
});
