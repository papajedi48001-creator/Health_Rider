// Set once per build in next.config.ts, so the browser and the server each know which build they run.
export const appVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? 'development';
