import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';

// Runs deploy/updater/health-rider-updater.py against a throwaway git repository with release tags,
// a fake docker that "builds" whatever is checked out, and a file:// health check.

const updater = path.resolve(__dirname, '../../deploy/updater/health-rider-updater.py');
const hasPython = spawnSync('python3', ['--version']).status === 0;

let root = '';
let repo = '';
let state = '';
let health = '';
let bin = '';

const entry = (version: string, schemaChange = false) => ({
  version, releasedAt: '2026-11-09T01:00:00+07:00', title: `รุ่น ${version}`, whatsNew: [`มีอะไรใหม่ใน ${version}`], schemaChange,
});

function git(...args: string[]) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
}

function release(version: string, older: string[], options: { floor?: string; tag?: boolean } = {}) {
  const manifest = { rollbackFloor: options.floor ?? '1.0.0', releases: [entry(version), ...older.map((item) => entry(item))] };
  writeFileSync(path.join(repo, 'platform/releases.json'), JSON.stringify(manifest));
  git('add', '.');
  git('commit', '-qm', `release ${version}`);
  if (options.tag !== false) git('tag', `v${version}`);
}

function run(extra: Record<string, string> = {}) {
  const result = spawnSync('python3', [updater], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HR_REPO_DIR: repo, HR_STATE_DIR: state, HR_HEALTH_URL: `file://${health}`, HR_HEALTH_TIMEOUT: '2',
      HR_BACKUP: 'off', HR_GIT_REMOTE: 'origin', HR_BACKUP_DIR: path.join(root, 'backups'), ...extra,
    },
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return JSON.parse(readFileSync(path.join(state, 'status.json'), 'utf8'));
}

function ask(version: string | null, action = 'update') {
  writeFileSync(path.join(state, 'request.json'), JSON.stringify({
    id: `req-${version}-${Date.now()}`, action, version, from: null, reason: 'ทดสอบ', requestedAt: new Date().toISOString(), requestedBy: { id: 'admin-1', name: 'ผู้ดูแล' },
  }));
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'hr-host-'));
  repo = path.join(root, 'repo');
  state = path.join(root, 'state');
  health = path.join(root, 'version.json');
  bin = path.join(root, 'bin');
  mkdirSync(path.join(repo, 'platform'), { recursive: true });
  mkdirSync(bin);
  mkdirSync(state);
  execFileSync('git', ['init', '-q', '-b', 'main', repo]);
  // A bare "GitHub" the updater fetches from.
  execFileSync('git', ['init', '-q', '--bare', path.join(root, 'origin.git')]);
  git('remote', 'add', 'origin', path.join(root, 'origin.git'));
  writeFileSync(path.join(repo, 'platform/compose.production.yaml'), 'services: {}\n');
  // The fake docker "starts" whatever version is checked out, unless that version is marked broken.
  writeFileSync(path.join(bin, 'docker'), `#!/bin/sh
version=$(python3 -c "import json;print(json.load(open('releases.json'))['releases'][0]['version'])")
if [ -f "${root}/broken-$version" ]; then echo "build failed for $version" >&2; exit 1; fi
printf '{"version":"build","release":"%s"}' "$version" > "${health}"
echo "$version" >> "${root}/docker.log"
`);
  chmodSync(path.join(bin, 'docker'), 0o755);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

test.skipIf(!hasPython)('reports the versions it can install and the one that runs', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0']);
  git('checkout', '-q', 'v1.0.0');
  git('push', '-q', 'origin', 'main', '--tags');

  const status = run();
  expect(status.current).toBe('1.0.0');
  expect(status.deployedRef).toBe('v1.0.0');
  expect(status.rollbackFloor).toBe('1.0.0');
  expect(status.releases.map((item: { version: string }) => item.version)).toEqual(['1.1.0', '1.0.0']);
  expect(status.releases[0].whatsNew).toEqual(['มีอะไรใหม่ใน 1.1.0']);
  expect(status.fetchError).toBeNull();
});

test.skipIf(!hasPython)('updates to a newer version and rolls back, but never below the floor', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0']);
  git('checkout', '-q', 'v1.0.0');

  ask('1.1.0');
  let status = run();
  expect(status.job).toMatchObject({ action: 'update', from: '1.0.0', version: '1.1.0', state: 'succeeded', requestedBy: 'ผู้ดูแล' });
  expect(status.current).toBe('1.1.0');
  expect(git('describe', '--tags', '--exact-match', 'HEAD')).toBe('v1.1.0');
  expect(existsSync(path.join(state, 'request.json'))).toBe(false);

  ask('1.0.0');
  status = run();
  expect(status.job).toMatchObject({ action: 'rollback', from: '1.1.0', version: '1.0.0', state: 'succeeded' });
  expect(status.history.map((job: { action: string }) => job.action)).toEqual(['rollback', 'update']);

  // A tag from before the update system existed is never installed, even if asked directly.
  git('tag', 'v0.9.0', 'v1.0.0');
  ask('0.9.0');
  status = run();
  expect(status.job).toMatchObject({ state: 'rejected', message: 'ย้อนกลับได้ถึงเวอร์ชัน 1.0.0 เท่านั้น' });
  expect(status.releases.map((item: { version: string }) => item.version)).toEqual(['1.1.0', '1.0.0']);
  expect(status.current).toBe('1.0.0');
});

test.skipIf(!hasPython)('goes back to the previous version when the new one does not start', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0']);
  git('checkout', '-q', 'v1.0.0');
  writeFileSync(path.join(root, 'broken-1.1.0'), '');

  ask('1.1.0');
  const status = run();
  expect(status.job.state).toBe('failed');
  expect(status.job.message).toMatch(/docker compose up ไม่สำเร็จ.*กลับไปใช้เวอร์ชัน 1\.0\.0 แล้ว/);
  expect(status.current).toBe('1.0.0');
  expect(readFileSync(health, 'utf8')).toContain('"release":"1.0.0"');
});

test.skipIf(!hasPython)('refuses junk and versions without a tag, and ignores tags with a broken manifest', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0'], { tag: false });
  writeFileSync(path.join(repo, 'platform/releases.json'), '{"broken":');
  git('commit', '-qam', 'broken');
  git('tag', 'v1.2.0');
  git('checkout', '-q', 'v1.0.0');

  let status = run();
  expect(status.releases.map((item: { version: string }) => item.version)).toEqual(['1.0.0']);

  ask('1.1.0');
  status = run();
  expect(status.job).toMatchObject({ state: 'rejected', message: 'ไม่พบเวอร์ชัน 1.1.0 ใน GitHub' });

  ask('1.0.0; touch /tmp/pwned');
  status = run();
  expect(status.job).toMatchObject({ state: 'rejected', message: 'คำสั่งไม่ระบุเวอร์ชันที่ถูกต้อง' });
  expect(readFileSync(path.join(root, 'docker.log'), { encoding: 'utf8', flag: 'a+' })).toBe('');
});

test.skipIf(!hasPython)('backs up the database before changing versions, without the password on the command line', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0']);
  git('checkout', '-q', 'v1.0.0');
  writeFileSync(path.join(repo, 'platform/.env.production'), 'DATABASE_URL="mysql://health_rider:s%40cret@192.168.1.254:3306/health_rider"\n');
  writeFileSync(path.join(bin, 'mysqldump'), `#!/bin/sh
echo "$@" > "${root}/dump-args"
echo "$MYSQL_PWD" > "${root}/dump-password"
echo "CREATE TABLE t (id int);"
`);
  chmodSync(path.join(bin, 'mysqldump'), 0o755);
  copyFileSync(path.join(bin, 'mysqldump'), path.join(bin, 'mariadb-dump'));

  ask('1.1.0');
  const status = run({ HR_BACKUP: 'required' });
  expect(status.job.state).toBe('succeeded');
  expect(status.job.backup).toMatch(/health-rider-1\.0\.0-to-1\.1\.0-.*\.sql\.gz$/);
  expect(readdirSync(path.join(root, 'backups'))).toHaveLength(1);
  expect(readFileSync(path.join(root, 'dump-args'), 'utf8')).not.toContain('cret');
  expect(readFileSync(path.join(root, 'dump-password'), 'utf8').trim()).toBe('s@cret');
});

test.skipIf(!hasPython)('a failed backup stops the change before anything is checked out', () => {
  release('1.0.0', []);
  release('1.1.0', ['1.0.0']);
  git('checkout', '-q', 'v1.0.0');
  writeFileSync(path.join(repo, 'platform/.env.production'), 'DATABASE_URL=mysql://u:p@db:3306/hr\n');
  writeFileSync(path.join(bin, 'mysqldump'), '#!/bin/sh\necho "Access denied" >&2\nexit 2\n');
  chmodSync(path.join(bin, 'mysqldump'), 0o755);
  copyFileSync(path.join(bin, 'mysqldump'), path.join(bin, 'mariadb-dump'));

  ask('1.1.0');
  const status = run({ HR_BACKUP: 'required' });
  expect(status.job.state).toBe('failed');
  expect(status.job.message).toMatch(/สำรองฐานข้อมูลไม่สำเร็จ: Access denied/);
  expect(git('describe', '--tags', '--exact-match', 'HEAD')).toBe('v1.0.0');
});
