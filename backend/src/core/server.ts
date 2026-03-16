import express from 'express';
import dotenv from 'dotenv';
import { secretsManager } from '../services/secrets-manager';
import { modules } from '../modules';
import { setServerReady } from '../modules/middleware';
import { errorHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { validateEnvironmentVariables } from './env-validation';
import {
  testConnections,
  setupGracefulShutdown,
  startConnectionHealthCheck,
  stopConnectionHealthCheck,
  closeAllPools,
  validateRequiredExtensions,
  ensurePerformanceIndexes,
  ensureSchemas,
} from '../utils/database-context';

dotenv.config();

// ===========================================
// Server Configuration Interface
// ===========================================

export interface ServerConfig {
  port?: number;
  /** When true, server is running inside Electron */
  electronMode?: boolean;
  /** Custom allowed CORS origins */
  allowedOrigins?: string[];
}

const app = express();
const PORT = process.env.PORT || 3000;

// HTTP server reference for graceful shutdown
let httpServer: import('http').Server | null = null;

// ===========================================
// Phase 2: Register routes from all modules (order matters!)
// ===========================================

for (const mod of modules) {
  mod.registerRoutes(app);
}

// ===========================================
// Phase 3: Final middleware (Sentry error handler, 404, error handler)
// ===========================================

// Phase 66: Sentry error handler (must be BEFORE 404 and app error handler)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Sentry, isSentryInitialized } = require('../services/observability/sentry');
  if (isSentryInitialized()) {
    Sentry.setupExpressErrorHandler(app);
  }
} catch { /* Sentry not available */ }

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`
    }
  });
});

// Error handling - centralized error handler
app.use(errorHandler);

// Setup graceful shutdown for database connections
setupGracefulShutdown();

// ===========================================
// Server Startup
// ===========================================

async function startServer(): Promise<void> {
  // Run module onStartup (observability, sentry, encryption, etc.)
  // These run in parallel with secrets initialization for non-critical services
  for (const mod of modules) {
    if (mod.onStartup && ['observability', 'security'].includes(mod.name)) {
      try {
        await mod.onStartup();
      } catch (error) {
        logger.warn(`[Module] ${mod.name}: early startup failed (non-critical)`, {
          operation: 'startup',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  // Initialize Secrets Manager BEFORE server starts
  try {
    await secretsManager.initialize();
    logger.info('SecretsManager initialized successfully');
  } catch (error) {
    logger.error('FATAL: SecretsManager initialization failed', error instanceof Error ? error : undefined);
    process.exit(1);
  }

  // Additional environment validation
  validateEnvironmentVariables();

  // Start HTTP server
  httpServer = app.listen(PORT, async () => {
    const server = httpServer!;

    // Phase 57: Initialize WebSocket for Voice Signaling
    try {
      const { voiceSignaling } = await import('../services/voice/webrtc-signaling');
      voiceSignaling.initialize(server);
      logger.info('Voice WebSocket server initialized', { operation: 'startup' });
    } catch (error) {
      logger.error('Voice WebSocket initialization failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Log startup info
    const secretsHealth = secretsManager.getHealthSummary();
    const secretsDbStatus = secretsManager.getDatabaseStatus();
    const aiStatus = secretsManager.getAIProviderStatus();
    const cacheStatus = secretsManager.getCacheStatus();

    logger.info('ZenAI Backend starting', {
      operation: 'startup',
      phase: 78,
      server: `http://localhost:${PORT}`,
      apiDocs: `http://localhost:${PORT}/api-docs`,
      environment: secretsManager.isProduction() ? 'PRODUCTION' : secretsManager.isDevelopment() ? 'development' : 'unknown',
      secrets: secretsHealth.healthy ? 'OK' : 'WARNINGS',
      secretsConfigured: secretsHealth.secretsConfigured,
      database: secretsDbStatus.configured ? secretsDbStatus.type.toUpperCase() : 'NOT CONFIGURED',
      ai: aiStatus.configured ? aiStatus.providers.join(', ').toUpperCase() : 'NOT CONFIGURED',
      cache: cacheStatus.type.toUpperCase(),
      modules: modules.length,
    });

    // Ensure all 4 context schemas exist
    try {
      await ensureSchemas();
      logger.info('All database schemas ensured');
    } catch (error) {
      logger.warn('Schema creation check failed (non-fatal)', { error: error instanceof Error ? error.message : String(error) });
    }

    // Test all database connections
    logger.info('Testing database connections...');
    const dbStatus = await testConnections();
    const failedContexts = Object.entries(dbStatus).filter(([, ok]) => !ok).map(([ctx]) => ctx);

    if (Object.values(dbStatus).every(ok => ok)) {
      logger.info('All databases connected successfully', { dbStatus, operation: 'startup' });
    } else if (!dbStatus.personal && !dbStatus.work) {
      logger.error('CRITICAL: Both primary databases failed to connect - shutting down', undefined, { dbStatus, operation: 'startup' });
      process.exit(1);
    } else {
      logger.warn(`Database connections failed: ${failedContexts.join(', ')}`, { dbStatus, failedContexts, operation: 'startup' });
    }

    // Open readiness gate
    setServerReady(true);
    logger.info('Server ready to accept requests', { operation: 'startup' });

    // Validate PostgreSQL extensions
    const extensionStatus = await validateRequiredExtensions();
    if (!extensionStatus.valid) {
      logger.error('CRITICAL: Required PostgreSQL extensions missing', undefined, { missing: extensionStatus.missing, operation: 'startup' });
    } else if (extensionStatus.optional.length > 0) {
      logger.warn('Optional PostgreSQL extensions missing', { optional: extensionStatus.optional, operation: 'startup' });
    } else {
      logger.info('All PostgreSQL extensions validated', { installed: extensionStatus.installed, operation: 'startup' });
    }

    // Start periodic connection health checks
    startConnectionHealthCheck(5 * 60 * 1000);

    // Deferred non-critical initialization
    setImmediate(async () => {
      // Ensure performance indexes
      try {
        const indexResult = await ensurePerformanceIndexes();
        logger.info('Performance indexes verified (deferred)', { ...indexResult, operation: 'startup' });
      } catch (error) {
        logger.warn('Performance index creation skipped (non-critical)', {
          error: error instanceof Error ? error.message : String(error),
          operation: 'startup',
        });
      }

      // Run remaining module onStartup methods
      for (const mod of modules) {
        if (mod.onStartup && !['observability', 'security', 'middleware'].includes(mod.name)) {
          try {
            await mod.onStartup();
            logger.info(`[Module] ${mod.name}: started`, { operation: 'startup' });
          } catch (err) {
            logger.error(`[Module] ${mod.name}: startup failed (non-critical)`, err instanceof Error ? err : undefined, { operation: 'startup' });
          }
        }
      }

      // Initialize Queue Service and Workers
      try {
        const { getQueueService } = await import('../services/queue/job-queue');
        const { startWorkers } = await import('../services/queue/workers');
        const queueService = getQueueService();
        const queueAvailable = await queueService.initialize();
        if (queueAvailable) {
          await startWorkers();
          try {
            const { scheduleSleepJobs } = await import('../services/queue/workers/sleep-worker');
            await scheduleSleepJobs();
          } catch (sleepErr) {
            logger.debug('Sleep job scheduling skipped', {
              operation: 'startup',
              error: sleepErr instanceof Error ? sleepErr.message : String(sleepErr),
            });
          }
          logger.info('Queue service and workers started (deferred)', { operation: 'startup' });
        } else {
          logger.info('Queue service not available (REDIS_URL not set)', { operation: 'startup' });
        }
      } catch (error) {
        logger.error('Queue service failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
      }
    });
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Run module shutdown handlers
  for (const mod of [...modules].reverse()) {
    if (mod.onShutdown) {
      try {
        await mod.onShutdown();
      } catch { /* ignore */ }
    }
  }

  // Shutdown queue workers and tracing
  try {
    const { stopWorkers } = await import('../services/queue/workers');
    await stopWorkers();
  } catch { /* ignore */ }
  try {
    const { getQueueService } = await import('../services/queue/job-queue');
    await getQueueService().shutdown();
  } catch { /* ignore */ }

  // Stop accepting new connections
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
  }

  // Close database connections last
  stopConnectionHealthCheck();
  await closeAllPools().catch(() => {});
  logger.info('Graceful shutdown complete');
  process.exit(0);
};
process.once('SIGTERM', () => { gracefulShutdown('SIGTERM'); });
process.once('SIGINT', () => { gracefulShutdown('SIGINT'); });

// ===========================================
// Exported API for Electron Integration
// ===========================================

export async function createServer(config?: ServerConfig): Promise<typeof app> {
  if (config?.port) {
    process.env.PORT = String(config.port);
  }
  if (config?.electronMode) {
    process.env.ELECTRON_MODE = 'true';
  }
  await startServer();
  return app;
}

/** Export the Express app for testing */
export { app };

/**
 * Start the server if the caller is the main entry point.
 * @param callerModule - pass `require.main` from the calling file
 * @param callerRef - pass `module` from the calling file
 */
export function startIfMain(callerModule: NodeModule | undefined, callerRef: NodeModule): void {
  if (callerModule === callerRef) {
    startServer().catch((error) => {
      logger.error('FATAL: Server startup failed', error instanceof Error ? error : undefined);
      console.error('Server startup failed:', error);
      process.exit(1);
    });
  }
}
