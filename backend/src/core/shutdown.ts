import type http from 'http';
import { logger } from '../utils/logger';

type ShutdownHandler = () => Promise<void>;

export class ShutdownCoordinator {
  private handlers: Array<{ name: string; handler: ShutdownHandler }> = [];
  private isShuttingDown = false;

  register(name: string, handler: ShutdownHandler): void {
    this.handlers.push({ name, handler });
  }

  async shutdown(server?: http.Server): Promise<void> {
    if (this.isShuttingDown) {return;}
    this.isShuttingDown = true;

    logger.info('[Shutdown] Starting graceful shutdown...');

    // Close HTTP server first
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('[Shutdown] HTTP server closed');
          resolve();
        });
        // Force close after 10s
        setTimeout(resolve, 10000);
      });
    }

    // Run shutdown handlers in reverse order
    for (const { name, handler } of [...this.handlers].reverse()) {
      try {
        await handler();
        logger.info(`[Shutdown] ${name}: OK`);
      } catch (err) {
        logger.error(`[Shutdown] ${name}: ERROR`, err instanceof Error ? err : undefined);
      }
    }

    logger.info('[Shutdown] Complete');
  }

  attachSignalHandlers(server: http.Server): void {
    const handle = () => {
      this.shutdown(server).then(() => process.exit(0));
    };
    process.on('SIGTERM', handle);
    process.on('SIGINT', handle);
  }
}
