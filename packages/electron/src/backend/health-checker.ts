import { EventEmitter } from 'events';

/** Emitted events:
 *  - 'healthy'       — backend responded with ok status
 *  - 'unhealthy'     — backend unreachable or responded with non-ok status
 *  - 'statusChange'  — boolean: true = just became healthy, false = just became unhealthy
 */
export class HealthChecker extends EventEmitter {
  private readonly url: string;
  private readonly intervalMs: number;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  /** null = never checked yet */
  private lastHealthy: boolean | null = null;

  constructor(url: string, intervalMs: number) {
    super();
    this.url = url;
    this.intervalMs = intervalMs;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /** Begin polling at the configured interval. */
  start(): void {
    if (this.intervalHandle !== null) return;
    this.intervalHandle = setInterval(() => {
      void this.checkNow();
    }, this.intervalMs);
  }

  /** Stop polling. */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Perform a single health check immediately. Returns true if healthy. */
  async checkNow(): Promise<boolean> {
    const healthy = await this.fetchHealth();
    this.updateStatus(healthy);
    return healthy;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async fetchHealth(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(this.url, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private updateStatus(healthy: boolean): void {
    this.emit(healthy ? 'healthy' : 'unhealthy');

    if (this.lastHealthy !== healthy) {
      this.lastHealthy = healthy;
      this.emit('statusChange', healthy);
    }
  }
}
