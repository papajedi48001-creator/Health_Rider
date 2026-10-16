type Environment = Record<string, string | undefined>;

const minimumAuthSecretLength = 32;
const knownDevelopmentSecrets = new Set([
  'development-only-replace-before-production',
  'replace-with-a-long-random-value',
]);

export function getDatabaseUrl(environment: Environment): string {
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  return databaseUrl;
}

export function getAuthSecret(environment: Environment): string {
  const authSecret = environment.AUTH_SECRET?.trim();

  if (!authSecret) {
    throw new Error('AUTH_SECRET is required');
  }
  if (authSecret.length < minimumAuthSecretLength || knownDevelopmentSecrets.has(authSecret)) {
    throw new Error(`AUTH_SECRET must be a random value of at least ${minimumAuthSecretLength} characters`);
  }

  return authSecret;
}
