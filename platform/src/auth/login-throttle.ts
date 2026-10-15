const windowMs = 15 * 60 * 1000;

type FailureWindow = { failures: number; startedAt: number };

// Per-process limit on repeated password failures for one key (a username or a client address).
// A single web container is deployed.
export class LoginThrottle {
  private readonly windows = new Map<string, FailureWindow>();

  constructor(private readonly maximumFailures = 10) {}

  isBlocked(key: string, now: number): boolean {
    const window = this.windows.get(key);
    if (!window) return false;
    if (now - window.startedAt >= windowMs) {
      this.windows.delete(key);
      return false;
    }
    return window.failures >= this.maximumFailures;
  }

  recordFailure(key: string, now: number): void {
    const window = this.windows.get(key);
    if (!window || now - window.startedAt >= windowMs) {
      this.windows.set(key, { failures: 1, startedAt: now });
      return;
    }
    window.failures += 1;
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}
