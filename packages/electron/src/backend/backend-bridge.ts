import { EventEmitter } from 'events';
import { HealthChecker } from './health-checker';
import { LocalBackend } from './local-backend';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BackendStatus =
  | 'cloud_connected'
  | 'cloud_checking'
  | 'local_starting'
  | 'local_connected'
  | 'disconnected';

/** Emitted events:
 *  - 'statusChange' (status: BackendStatus) — whenever the status transitions
 */
export class BackendBridge extends EventEmitter {
  private readonly cloudUrl: string;
  private readonly localPort: number;
  private readonly startupTimeout: number;

  private readonly healthChecker: HealthChecker;
  private readonly localBackend: LocalBackend;

  private status: BackendStatus = 'disconnected';

  constructor(
    cloudUrl: string,
    localPort: number,
    isDev: boolean,
    healthCheckInterval: number,
    startupTimeout: number,
  ) {
    super();
    this.cloudUrl = cloudUrl;
    this.localPort = localPort;
    this.startupTimeout = startupTimeout;

    this.healthChecker = new HealthChecker(`${cloudUrl}/api/health`, healthCheckInterval);
    this.localBackend = new LocalBackend(localPort, isDev);

    // When cloud health flips, handle failover / recovery
    this.healthChecker.on('statusChange', (healthy: unknown) => {
      void this.handleHealthChange(Boolean(healthy));
    });
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    const cloudHealthy = await this.probeCloud();

    if (cloudHealthy) {
      this.setStatus('cloud_connected');
      this.healthChecker.start();
      return;
    }

    // Cloud unreachable — try local fallback
    await this.startLocal();
  }

  async stop(): Promise<void> {
    this.healthChecker.stop();
    await this.localBackend.stop();
  }

  getStatus(): BackendStatus {
    return this.status;
  }

  getBaseUrl(): string {
    if (this.status === 'cloud_connected') return this.cloudUrl;
    if (this.status === 'local_connected') return `http://localhost:${this.localPort}`;
    return '';
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async probeCloud(): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this.cloudUrl}/api/health`, { signal: controller.signal });
      return res.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async startLocal(): Promise<void> {
    this.setStatus('local_starting');
    try {
      await this.localBackend.start(this.startupTimeout);
      this.setStatus('local_connected');
    } catch {
      this.setStatus('disconnected');
    }
  }

  private async handleHealthChange(cloudHealthy: boolean): Promise<void> {
    if (cloudHealthy && this.status !== 'cloud_connected') {
      // Cloud came back — switch back to cloud
      this.setStatus('cloud_connected');
    } else if (!cloudHealthy && this.status === 'cloud_connected') {
      // Cloud went down — fallback to local
      await this.startLocal();
    }
  }

  private setStatus(next: BackendStatus): void {
    if (this.status === next) return;
    this.status = next;
    this.emit('statusChange', next);
  }
}
