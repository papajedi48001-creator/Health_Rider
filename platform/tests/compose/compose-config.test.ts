import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

const dockerConfig = path.join(process.cwd(), '.docker');

function hasDockerCompose(): boolean {
  try {
    execFileSync('docker', ['compose', 'version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function composeConfig(environment: Record<string, string>) {
  mkdirSync(dockerConfig, { recursive: true });
  return JSON.parse(
    execFileSync('docker', ['--config', dockerConfig, 'compose', '-f', 'compose.yaml', 'config', '--format', 'json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}

const required = { AUTH_SECRET: 'a'.repeat(32), MARIADB_PASSWORD: 'p'.repeat(20), MARIADB_ROOT_PASSWORD: 'r'.repeat(20), WEB_PUBLISH: '' };

test.skipIf(!hasDockerCompose())('runs migrations before the web service and requires an auth secret', () => {
  const config = composeConfig(required);

  expect(Object.keys(config.services).sort()).toEqual(['db', 'migrate', 'web']);
  expect(config.services.db.healthcheck).toBeDefined();
  expect(config.services.web.depends_on.migrate.condition).toBe('service_completed_successfully');
  expect(config.services.web.environment.HOS_ELIGIBLE_ITEM_CODES).toBeDefined();
  expect(() => composeConfig({ ...required, AUTH_SECRET: '' })).toThrow();
});

test.skipIf(!hasDockerCompose())('refuses default database passwords and keeps plain HTTP on this machine', () => {
  expect(() => composeConfig({ ...required, MARIADB_PASSWORD: '' })).toThrow();
  expect(() => composeConfig({ ...required, MARIADB_ROOT_PASSWORD: '' })).toThrow();
  const config = composeConfig(required);
  expect(config.services.web.ports[0].host_ip).toBe('127.0.0.1');
  expect(config.services.web.environment.DATABASE_URL).toBe(`mysql://health_rider:${'p'.repeat(20)}@db:3306/health_rider`);
});
