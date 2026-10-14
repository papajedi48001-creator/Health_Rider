const maximumFailures = 10;
const windowMs = 15 * 60 * 1000;

type FailureWindow = { failures: number; startedAt: number };

// Per-process limit on repeated password failures for one username. A single web container is deployed.
export class LoginThrottle {
  private readonly windows = new Map<string, FailureWindow>();

  isBlocked(username: string, now: number): boolean {
    const window = this.windows.get(username);
    if (!window) return false;
    if (now - window.startedAt >= windowMs) {
      this.windows.delete(username);
      return false;
    }
    return window.failures >= maximumFailures;
  }

  recordFailure(username: string, now: number): void {
    const window = this.windows.get(username);
    if (!window || now - window.startedAt >= windowMs) {
      this.windows.set(username, { failures: 1, startedAt: now });
      return;
    }
    window.failures += 1;
  }

  reset(username: string): void {
    this.windows.delete(username);
  }
}
