// Creates the Prisma client for the app, the seed script and browser tests.
//
// The hospital MariaDB server forces every connection to tis620 (skip-character-set-client-handshake
// and init_connect = 'SET NAMES tis620'), which Prisma's built-in driver cannot read back as UTF-8.
// The MariaDB driver adapter lets each new connection switch itself to utf8mb4 before any query.
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';

/** @param {string} databaseUrl mysql://user:password@host:port/database */
export function mariadbPoolConfig(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'mysql:' && url.protocol !== 'mariadb:') throw new Error('DATABASE_URL must be a mysql:// URL');
  const connectionLimit = Number(url.searchParams.get('connection_limit') ?? 10);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    connectionLimit: Number.isInteger(connectionLimit) && connectionLimit > 0 ? connectionLimit : 10,
    charset: 'utf8mb4',
    initSql: 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci',
  };
}

export function createPrismaClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');
  return new PrismaClient({ adapter: new PrismaMariaDb(mariadbPoolConfig(databaseUrl)) });
}
