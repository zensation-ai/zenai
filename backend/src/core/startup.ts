import express, { Express } from 'express';
import http from 'http';
import { Module } from './module';
import { ShutdownCoordinator } from './shutdown';
import { logger } from '../utils/logger';

export class StartupOrchestrator {
  private app: Express;
  private server?: http.Server;
  private shutdown: ShutdownCoordinator;

  constructor(
    private modules: Module[],
  ) {
    this.app = express();
    this.shutdown = new ShutdownCoordinator();
  }

  getApp(): Express {
    return this.app;
  }

  /**
   * Phase 1: Setup all global middleware on the app.
   * Called by the middleware module before route registration.
   */
  setupMiddleware(setupFn: (app: Express) => void): void {
    setupFn(this.app);
  }

  /**
   * Phase 2: Register routes from all modules (order matters!).
   */
  registerRoutes(): void {
    for (const mod of this.modules) {
      mod.registerRoutes(this.app);
      logger.info(`[Module] ${mod.name}: routes registered`, { operation: 'startup' });
    }
  }

  /**
   * Phase 3: Apply final middleware (error handlers, 404, Sentry).
   */
  applyFinalMiddleware(setupFn: (app: Express) => void): void {
    setupFn(this.app);
  }

  /**
   * Phase 4: Start HTTP server.
   */
  async listen(port: number): Promise<http.Server> {
    this.server = await new Promise<http.Server>((resolve) => {
      const srv = this.app.listen(port, () => {
        logger.info(`[Server] Listening on port ${port}`, { operation: 'startup' });
        resolve(srv);
      });
    });
    return this.server;
  }

  /**
   * Phase 5: Run async onStartup for all modules.
   */
  async startModules(): Promise<void> {
    for (const mod of this.modules) {
      if (mod.onStartup) {
        try {
          await mod.onStartup();
          logger.info(`[Module] ${mod.name}: started`, { operation: 'startup' });
        } catch (err) {
          logger.error(`[Module] ${mod.name}: startup failed (non-critical)`, err instanceof Error ? err : undefined, { operation: 'startup' });
        }
      }
    }
  }

  /**
   * Phase 6: Register shutdown handlers from all modules.
   */
  registerShutdownHandlers(): void {
    for (const mod of this.modules) {
      if (mod.onShutdown) {
        this.shutdown.register(mod.name, mod.onShutdown.bind(mod));
      }
    }
    if (this.server) {
      this.shutdown.attachSignalHandlers(this.server);
    }
  }

  getServer(): http.Server | undefined {
    return this.server;
  }

  getShutdown(): ShutdownCoordinator {
    return this.shutdown;
  }
}
