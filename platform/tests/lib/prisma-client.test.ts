import { describe, expect, it } from 'vitest';
import { mariadbPoolConfig } from '@/lib/prisma-client.mjs';

describe('MariaDB connection settings', () => {
  it('reads the database URL and switches every connection to utf8mb4', () => {
    const config = mariadbPoolConfig('mysql://health_rider:p%40ss%3Aword@192.168.1.254:3306/health_rider');
    expect(config).toMatchObject({ host: '192.168.1.254', port: 3306, user: 'health_rider', password: 'p@ss:word', database: 'health_rider', charset: 'utf8mb4' });
    // The hospital server forces tis620 on connect; Thai text only round-trips once the session is utf8mb4.
    expect(config.initSql).toBe('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
  });

  it('defaults the port and rejects other URL schemes', () => {
    expect(mariadbPoolConfig('mysql://u:p@db/health_rider').port).toBe(3306);
    expect(() => mariadbPoolConfig('postgres://u:p@db/x')).toThrow();
  });
});
