import { DomainError } from '@/domain/errors';

// One published version of the app. Each one is a git tag v<version> on the repository; the host updater
// checks out that tag and rebuilds the containers.
export type Release = {
  version: string;
  releasedAt: string;
  title: string;
  whatsNew: string[];
  // True when the version adds database migrations. Rolling back past it keeps the newer tables and columns.
  schemaChange: boolean;
};

export type ReleaseManifest = { rollbackFloor: string; releases: Release[] };

// The first version that has the update system. Older versions cannot be installed from the admin page,
// whatever a manifest says, because they do not have the updater channel to come back from.
export const firstUpdatableVersion = '1.0.0';

const versionPattern = /^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/;

export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && versionPattern.test(value);
}

// Negative when left is older than right.
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return (a[index] ?? 0) - (b[index] ?? 0);
  }
  return 0;
}

// Checks a releases.json document and returns its releases newest first. Throws a plain Error naming the
// first problem, so tests and the updater both refuse a broken manifest instead of guessing.
export function parseReleaseManifest(input: unknown): ReleaseManifest {
  const document = input as { rollbackFloor?: unknown; releases?: unknown } | null;
  if (!document || typeof document !== 'object') throw new Error('releases.json must be an object');
  if (!isVersion(document.rollbackFloor)) throw new Error('rollbackFloor must be a version such as 1.0.0');
  if (compareVersions(document.rollbackFloor, firstUpdatableVersion) < 0) throw new Error(`rollbackFloor cannot be older than ${firstUpdatableVersion}`);
  if (!Array.isArray(document.releases) || document.releases.length === 0) throw new Error('releases must list at least one version');

  const releases = document.releases.map((entry, index) => parseRelease(entry, index));
  const seen = new Set<string>();
  for (const release of releases) {
    if (seen.has(release.version)) throw new Error(`version ${release.version} is listed twice`);
    seen.add(release.version);
  }
  releases.sort((left, right) => compareVersions(right.version, left.version));
  if (!seen.has(document.rollbackFloor)) throw new Error(`rollbackFloor ${document.rollbackFloor} must be one of the releases`);
  return { rollbackFloor: document.rollbackFloor, releases: releases.filter((release) => compareVersions(release.version, document.rollbackFloor as string) >= 0) };
}

function parseRelease(entry: unknown, index: number): Release {
  const value = entry as Partial<Record<keyof Release, unknown>> | null;
  const where = `releases[${index}]`;
  if (!value || typeof value !== 'object') throw new Error(`${where} must be an object`);
  if (!isVersion(value.version)) throw new Error(`${where}.version must look like 1.2.3`);
  if (typeof value.releasedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value.releasedAt) || Number.isNaN(Date.parse(value.releasedAt))) {
    throw new Error(`${where}.releasedAt must be a date and time with its time zone, such as 2026-11-09T01:00:00+07:00`);
  }
  if (typeof value.title !== 'string' || !value.title.trim()) throw new Error(`${where}.title is required`);
  if (!Array.isArray(value.whatsNew) || value.whatsNew.length === 0 || value.whatsNew.some((line) => typeof line !== 'string' || !line.trim())) {
    throw new Error(`${where}.whatsNew must list at least one change`);
  }
  if (value.schemaChange !== undefined && typeof value.schemaChange !== 'boolean') throw new Error(`${where}.schemaChange must be true or false`);
  return {
    version: value.version,
    releasedAt: value.releasedAt,
    title: value.title.trim(),
    whatsNew: value.whatsNew.map((line) => (line as string).trim()),
    schemaChange: value.schemaChange === true,
  };
}

export type VersionChange = { action: 'update' | 'rollback'; from: string; to: string; crossesSchemaChange: boolean };

// Decides whether moving from the running version to a target is allowed and what kind of move it is.
// Only versions in the list may be chosen, and never one older than the rollback floor.
export function planVersionChange(manifest: ReleaseManifest, current: string | null, target: unknown): VersionChange {
  if (!isVersion(target)) throw new DomainError('เลือกเวอร์ชันที่ต้องการก่อน', 422);
  const floor = maxVersion(manifest.rollbackFloor, firstUpdatableVersion);
  if (compareVersions(target, floor) < 0) throw new DomainError(`ย้อนกลับได้ถึงเวอร์ชัน ${floor} เท่านั้น ซึ่งเป็นเวอร์ชันแรกที่มีระบบอัปเดต`, 422);
  if (!manifest.releases.some((release) => release.version === target)) throw new DomainError(`ไม่พบเวอร์ชัน ${target} ในรายการที่ติดตั้งได้`, 422);
  if (!current) throw new DomainError('ยังไม่ทราบเวอร์ชันที่ใช้อยู่ โปรดรอให้ตัวอัปเดตบนเซิร์ฟเวอร์ตรวจสอบก่อน', 409);
  if (compareVersions(target, current) === 0) throw new DomainError(`ระบบใช้เวอร์ชัน ${target} อยู่แล้ว`, 409);

  const action = compareVersions(target, current) > 0 ? 'update' : 'rollback';
  // Rolling back from 1.3 to 1.1 leaves the migrations of 1.3 and 1.2 in place.
  const crossesSchemaChange = action === 'rollback' && manifest.releases.some((release) => release.schemaChange
    && compareVersions(release.version, target) > 0 && compareVersions(release.version, current) <= 0);
  return { action, from: current, to: target, crossesSchemaChange };
}

function maxVersion(left: string, right: string) {
  return compareVersions(left, right) >= 0 ? left : right;
}
