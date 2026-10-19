import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const migrations = join(__dirname, '..', 'prisma', 'migrations');

// The migrate connection on the production server is not always utf8mb4, so Thai text written as a literal in a
// migration is stored garbled; write such values as X'…' UTF-8 bytes instead. Comments are not stored and may use Thai.
test('migrations keep non-ASCII text out of SQL statements', () => {
  const offending: string[] = [];
  // Migrations already applied in production cannot change; the next one repairs the names this one garbled.
  const applied = new Set(['20261019020000_health_centers']);
  for (const name of readdirSync(migrations, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    if (applied.has(name)) continue;
    readFileSync(join(migrations, name, 'migration.sql'), 'utf8').split('\n').forEach((line, index) => {
      const statement = line.replace(/--.*$/, '');
      if (/[^\x00-\x7F]/.test(statement)) offending.push(`${name}:${index + 1}`);
    });
  }
  expect(offending).toEqual([]);
});
