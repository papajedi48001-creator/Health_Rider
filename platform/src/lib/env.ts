type Environment = Record<string, string | undefined>;

export function getDatabaseUrl(environment: Environment): string {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return databaseUrl;
}

export function getHosDatabaseUrl(environment: Environment): string {
  const hosDatabaseUrl = environment.HOS_DATABASE_URL?.trim();

  if (!hosDatabaseUrl) {
    throw new Error('HOS_DATABASE_URL is required before reading HOS data');
  }

  return hosDatabaseUrl;
}
