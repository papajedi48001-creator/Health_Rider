import { describe, expect, test } from 'vitest';
import manifestJson from '../../releases.json';
import { DomainError } from '@/domain/errors';
import { compareVersions, firstUpdatableVersion, parseReleaseManifest, planVersionChange, type ReleaseManifest } from '@/domain/system-update/releases';

const release = (version: string, schemaChange = false) => ({
  version, releasedAt: '2026-11-09T01:00:00+07:00', title: `รุ่น ${version}`, whatsNew: ['แก้ไขเล็กน้อย'], schemaChange,
});

describe('releases.json', () => {
  test('the checked-in manifest is valid and starts the rollback floor at the first updatable version', () => {
    const manifest = parseReleaseManifest(manifestJson);
    expect(manifest.rollbackFloor).toBe(firstUpdatableVersion);
    expect(manifest.releases.at(-1)?.version).toBe(firstUpdatableVersion);
    // Newest first: the top entry is the version this build reports and the git tag it is published as.
    expect(manifestJson.releases[0]?.version).toBe(manifest.releases[0]?.version);
  });

  test('refuses broken manifests instead of guessing', () => {
    const valid = { rollbackFloor: '1.0.0', releases: [release('1.0.0')] };
    expect(() => parseReleaseManifest({ ...valid, rollbackFloor: '0.9.0' })).toThrow(/cannot be older/);
    expect(() => parseReleaseManifest({ ...valid, rollbackFloor: '1.1.0' })).toThrow(/must be one of the releases/);
    expect(() => parseReleaseManifest({ ...valid, releases: [release('1.0.0'), release('1.0.0')] })).toThrow(/twice/);
    expect(() => parseReleaseManifest({ ...valid, releases: [{ ...release('1.0.0'), releasedAt: '9 พ.ย. 2569' }] })).toThrow(/time zone/);
    expect(() => parseReleaseManifest({ ...valid, releases: [{ ...release('1.0.0'), whatsNew: [] }] })).toThrow(/whatsNew/);
    expect(() => parseReleaseManifest({ ...valid, releases: [release('v1.0.0')] })).toThrow(/1\.2\.3/);
  });

  test('sorts newest first and compares versions by number, not text', () => {
    const manifest = parseReleaseManifest({ rollbackFloor: '1.0.0', releases: [release('1.0.0'), release('1.10.0'), release('1.9.2')] });
    expect(manifest.releases.map((entry) => entry.version)).toEqual(['1.10.0', '1.9.2', '1.0.0']);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
  });
});

describe('planVersionChange', () => {
  const manifest: ReleaseManifest = parseReleaseManifest({
    rollbackFloor: '1.0.0', releases: [release('1.0.0'), release('1.1.0', true), release('1.2.0'), release('1.3.0')],
  });

  test('a newer version is an update and an older one a rollback', () => {
    expect(planVersionChange(manifest, '1.2.0', '1.3.0')).toEqual({ action: 'update', from: '1.2.0', to: '1.3.0', crossesSchemaChange: false });
    expect(planVersionChange(manifest, '1.2.0', '1.0.0')).toMatchObject({ action: 'rollback', crossesSchemaChange: true });
    expect(planVersionChange(manifest, '1.2.0', '1.1.0')).toMatchObject({ action: 'rollback', crossesSchemaChange: false });
  });

  test('never goes below the version where the update system started', () => {
    expect(() => planVersionChange(manifest, '1.2.0', '0.9.0')).toThrow(/ย้อนกลับได้ถึงเวอร์ชัน 1\.0\.0 เท่านั้น/);
    const raised = { ...manifest, rollbackFloor: '1.1.0', releases: manifest.releases.filter((entry) => entry.version !== '1.0.0') };
    expect(() => planVersionChange(raised, '1.2.0', '1.0.0')).toThrow(/1\.1\.0 เท่านั้น/);
  });

  test('refuses unknown versions, the running version and junk', () => {
    expect(() => planVersionChange(manifest, '1.2.0', '1.4.0')).toThrow(/ไม่พบเวอร์ชัน/);
    expect(() => planVersionChange(manifest, '1.2.0', '1.2.0')).toThrow(/อยู่แล้ว/);
    expect(() => planVersionChange(manifest, '1.2.0', '1.3.0; rm -rf /')).toThrow(DomainError);
    expect(() => planVersionChange(manifest, null, '1.3.0')).toThrow(/ยังไม่ทราบเวอร์ชัน/);
  });
});
