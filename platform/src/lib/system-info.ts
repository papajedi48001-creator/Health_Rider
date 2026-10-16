import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { basePath } from '@/lib/base-path';
import { db } from '@/lib/db';
import { getAuthSecret } from '@/lib/env';

type Environment = Record<string, string | undefined>;

// Read-only facts about settings that live in .env.production; never includes a password or secret value.
export async function systemInfo(environment: Environment = process.env) {
  return {
    basePath: basePath || '/',
    database: await databaseInfo(environment.DATABASE_URL),
    authSecret: authSecretStatus(environment),
    secureCookie: environment.NODE_ENV === 'production' && environment.SESSION_COOKIE_INSECURE !== 'true',
    evidence: await evidenceInfo(environment.EVIDENCE_STORAGE_PATH),
    runtime: { node: process.version, mode: environment.NODE_ENV ?? 'development' },
  };
}

async function databaseInfo(databaseUrl: string | undefined) {
  let host = '';
  let name = '';
  try {
    const url = new URL(databaseUrl ?? '');
    host = `${url.hostname}:${url.port || 3306}`;
    name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    return { host, name, version: null, migrations: null, error: 'DATABASE_URL ไม่ถูกต้อง' };
  }
  try {
    const [server] = await db.$queryRaw<Array<{ version: string }>>`SELECT VERSION() AS version`;
    const [applied] = await db.$queryRaw<Array<{ count: bigint | number }>>`SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    return { host, name, version: server?.version ?? null, migrations: Number(applied?.count ?? 0), error: null };
  } catch {
    return { host, name, version: null, migrations: null, error: 'เชื่อมต่อฐานข้อมูลไม่ได้' };
  }
}

function authSecretStatus(environment: Environment): string | null {
  try {
    getAuthSecret(environment);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

async function evidenceInfo(path: string | undefined) {
  const root = path?.trim() ?? '';
  if (!root) return { path: '', writable: false };
  try {
    await access(root, constants.W_OK);
    return { path: root, writable: true };
  } catch {
    return { path: root, writable: false };
  }
}
