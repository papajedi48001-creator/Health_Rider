import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DomainError } from '@/domain/errors';
import { isVersion, parseReleaseManifest, type Release } from '@/domain/system-update/releases';

// The web container and the host updater (deploy/updater/health-rider-updater.py) share one folder:
//   status.json  written by the host: versions it can install, the running job and past jobs
//   request.json written by this app: one pending request from an admin, removed by the host when taken
// The app never runs git or docker itself; it only leaves a request the host checks every minute.

export type UpdaterJobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'rejected';
export type UpdaterJob = {
  id: string;
  action: 'update' | 'rollback' | 'check';
  version: string | null;
  from: string | null;
  state: UpdaterJobState;
  step: string | null;
  message: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  backup: string | null;
};

export type UpdaterRequest = {
  id: string;
  action: 'update' | 'rollback' | 'check';
  version: string | null;
  from: string | null;
  reason: string | null;
  requestedAt: string;
  requestedBy: { id: string; name: string };
};

export type HostStatus = {
  checkedAt: string;
  fetchedAt: string | null;
  fetchError: string | null;
  current: string | null;
  deployedRef: string | null;
  rollbackFloor: string | null;
  releases: Release[];
  job: UpdaterJob | null;
  history: UpdaterJob[];
};

export type UpdaterState = {
  configured: boolean;
  writable: boolean;
  status: HostStatus | null;
  pending: UpdaterRequest | null;
  // The host has not written status.json for a while: its timer is stopped or failing.
  stale: boolean;
};

const statusFile = 'status.json';
const requestFile = 'request.json';
// The host timer runs every minute; three missed runs means it is not running.
const staleAfterMs = 3 * 60_000;

export function updaterStatePath(environment: Record<string, string | undefined> = process.env): string {
  return environment.UPDATER_STATE_PATH?.trim() ?? '';
}

export async function readUpdaterState(folder: string, now = new Date()): Promise<UpdaterState> {
  if (!folder) return { configured: false, writable: false, status: null, pending: null, stale: false };
  const [status, pending, writable] = await Promise.all([
    readJson(path.join(folder, statusFile)).then(parseHostStatus),
    readJson(path.join(folder, requestFile)).then(parseRequest),
    access(folder, constants.W_OK).then(() => true, () => false),
  ]);
  const stale = !status || now.getTime() - Date.parse(status.checkedAt) > staleAfterMs;
  return { configured: true, writable, status, pending, stale };
}

// Leaves one request for the host. Refuses while another request is waiting or a job is running.
export async function writeUpdaterRequest(folder: string, request: UpdaterRequest): Promise<void> {
  if (!folder) throw new DomainError('ยังไม่ได้ติดตั้งตัวอัปเดตบนเซิร์ฟเวอร์ (UPDATER_STATE_PATH)', 503);
  const target = path.join(folder, requestFile);
  const temporary = path.join(folder, `.${requestFile}.${request.id}`);
  await mkdir(folder, { recursive: true }).catch(() => undefined);
  try {
    await writeFile(temporary, `${JSON.stringify(request, null, 2)}\n`, { flag: 'wx', mode: 0o660 });
  } catch {
    throw new DomainError('บันทึกคำสั่งไม่ได้ โฟลเดอร์ของตัวอัปเดตไม่อนุญาตให้เขียน', 503);
  }
  try {
    if (await exists(target)) throw new DomainError('มีคำสั่งที่รอเซิร์ฟเวอร์ทำอยู่แล้ว ยกเลิกคำสั่งเดิมก่อนหรือรอให้เสร็จ', 409);
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function cancelUpdaterRequest(folder: string): Promise<UpdaterRequest | null> {
  if (!folder) return null;
  const target = path.join(folder, requestFile);
  const pending = parseRequest(await readJson(target));
  await rm(target, { force: true });
  return pending;
}

async function exists(file: string) {
  return access(file).then(() => true, () => false);
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null);

// status.json comes from the host. Anything malformed is dropped rather than shown.
export function parseHostStatus(input: unknown): HostStatus | null {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || !text(value.checkedAt) || Number.isNaN(Date.parse(value.checkedAt as string))) return null;
  let releases: Release[] = [];
  let rollbackFloor: string | null = null;
  try {
    const manifest = parseReleaseManifest({ rollbackFloor: value.rollbackFloor, releases: value.releases });
    releases = manifest.releases;
    rollbackFloor = manifest.rollbackFloor;
  } catch {
    // No tag yet, or the newest tag has a broken manifest: show no installable versions.
  }
  return {
    checkedAt: value.checkedAt as string,
    fetchedAt: text(value.fetchedAt),
    fetchError: text(value.fetchError),
    current: isVersion(value.current) ? value.current : null,
    deployedRef: text(value.deployedRef),
    rollbackFloor,
    releases,
    job: parseJob(value.job),
    history: Array.isArray(value.history) ? value.history.map(parseJob).filter((job): job is UpdaterJob => job !== null).slice(0, 30) : [],
  };
}

function parseJob(input: unknown): UpdaterJob | null {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || !text(value.id)) return null;
  const action = value.action === 'update' || value.action === 'rollback' || value.action === 'check' ? value.action : null;
  const states: UpdaterJobState[] = ['queued', 'running', 'succeeded', 'failed', 'rejected'];
  const state = states.find((entry) => entry === value.state);
  if (!action || !state) return null;
  return {
    id: value.id as string,
    action,
    version: isVersion(value.version) ? value.version : null,
    from: isVersion(value.from) ? value.from : text(value.from),
    state,
    step: text(value.step),
    message: text(value.message),
    requestedBy: text(value.requestedBy),
    requestedAt: text(value.requestedAt),
    startedAt: text(value.startedAt),
    finishedAt: text(value.finishedAt),
    backup: text(value.backup),
  };
}

function parseRequest(input: unknown): UpdaterRequest | null {
  const value = input as Record<string, unknown> | null;
  if (!value || typeof value !== 'object' || !text(value.id)) return null;
  const action = value.action === 'update' || value.action === 'rollback' || value.action === 'check' ? value.action : null;
  const by = value.requestedBy as { id?: unknown; name?: unknown } | null;
  if (!action || !text(value.requestedAt) || !by || typeof by !== 'object') return null;
  return {
    id: value.id as string,
    action,
    version: isVersion(value.version) ? value.version : null,
    from: text(value.from),
    reason: text(value.reason),
    requestedAt: value.requestedAt as string,
    requestedBy: { id: String(by.id ?? ''), name: String(by.name ?? '') },
  };
}
