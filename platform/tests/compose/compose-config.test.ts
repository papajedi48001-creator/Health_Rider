import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from 'vitest';

test('declares only web and db services with a database healthcheck', () => {
  const dockerConfig = path.join(process.cwd(), '.docker');
  mkdirSync(dockerConfig, { recursive: true });

  const config = JSON.parse(
    execFileSync(
      'docker',
      ['--config', dockerConfig, 'compose', '-f', 'compose.yaml', 'config', '--format', 'json'],
      { cwd: process.cwd(), encoding: 'utf8' },
    ),
  );

  expect(Object.keys(config.services).sort()).toEqual(['db', 'web']);
  expect(config.services.db.healthcheck).toBeDefined();
});
