import { spawn, execSync, ChildProcess } from 'child_process';
import { join, dirname } from 'path';

/** Signals that indicate the backend server is ready to accept connections. */
const READY_SIGNALS = ['Server running', 'listening on', 'Server:'];

export class LocalBackend {
  private readonly port: number;
  private readonly isDev: boolean;
  private process: ChildProcess | null = null;

  constructor(port: number, isDev: boolean) {
    this.port = port;
    this.isDev = isDev;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Spawn the backend process and wait until it signals readiness.
   * @param timeoutMs Maximum milliseconds to wait before rejecting.
   */
  start(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const { cmd, args, opts } = this.buildCommand();
      const proc = spawn(cmd, args, opts);
      this.process = proc;

      let settled = false;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        fn();
      };

      // Timeout guard
      const timeoutHandle = setTimeout(() => {
        settle(() => {
          proc.kill('SIGTERM');
          reject(new Error(`LocalBackend startup timeout after ${timeoutMs}ms`));
        });
      }, timeoutMs);

      // Watch stdout for ready signals
      proc.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (READY_SIGNALS.some((sig) => text.includes(sig))) {
          settle(() => resolve());
        }
      });

      // Process error (e.g. ENOENT — binary not found)
      proc.on('error', (err: Error) => {
        settle(() => reject(err));
      });

      // Process exited before signalling readiness
      proc.on('exit', (code: number | null) => {
        settle(() => reject(new Error(`Backend process exited with code ${code}`)));
      });
    });
  }

  /**
   * Gracefully shut the backend down with SIGTERM, then SIGKILL after 5s.
   */
  stop(): Promise<void> {
    return new Promise<void>((resolve) => {
      const proc = this.process;
      if (!proc) {
        resolve();
        return;
      }

      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        this.process = null;
        resolve();
      }, 5000);

      proc.on('exit', () => {
        clearTimeout(killTimer);
        this.process = null;
        resolve();
      });

      proc.kill('SIGTERM');
    });
  }

  /** Returns true if a child process is currently spawned. */
  isRunning(): boolean {
    return this.process !== null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private buildCommand(): { cmd: string; args: string[]; opts: object } {
    const env = { ...process.env, PORT: String(this.port) };
    const opts = { env, stdio: ['ignore', 'pipe', 'pipe'] };

    if (this.isDev) {
      // Development: npx ts-node-dev --respawn --transpile-only backend/src/main.ts
      const backendEntry = join(dirname(dirname(__dirname)), '..', '..', 'backend', 'src', 'main.ts');
      return {
        cmd: this.findBin('npx'),
        args: ['ts-node-dev', '--respawn', '--transpile-only', backendEntry],
        opts,
      };
    }

    // Production: node backend/dist/main.js
    const backendDist = join(dirname(dirname(__dirname)), '..', '..', 'backend', 'dist', 'main.js');
    return {
      cmd: this.findBin('node'),
      args: [backendDist],
      opts,
    };
  }

  /**
   * Locate a binary on PATH.  Falls back to the raw name (letting the OS
   * resolve it) if `which`/`where` is unavailable.
   */
  private findBin(name: string): string {
    try {
      const cmd = process.platform === 'win32' ? `where ${name}` : `which ${name}`;
      return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().split('\n')[0];
    } catch {
      return name;
    }
  }
}
