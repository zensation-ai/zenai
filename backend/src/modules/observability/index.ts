import type { Express } from 'express';
import type { Module } from '../../core/module';
import { observabilityRouter } from '../../routes/observability';
import { aiTracesRouter } from '../../routes/ai-traces';

export class ObservabilityModule implements Module {
  name = 'observability';

  registerRoutes(app: Express): void {
    // Phase 61: Observability - Metrics, Queue Stats, Health
    app.use('/api/observability', observabilityRouter);
    // Phase 73: AI Observability - Langfuse-style Trace Dashboard
    app.use('/api/observability', aiTracesRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Phase 66: Initialize Sentry
    try {
      const { initSentry } = await import('../../services/observability/sentry');
      const sentryAvailable = initSentry();
      logger.info('Sentry initialized', { operation: 'startup', available: sentryAvailable });
    } catch (error) {
      logger.warn('Sentry initialization failed (non-critical)', {
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Phase 61: Initialize OpenTelemetry tracing
    try {
      const { initTracing, shutdownTracing } = await import('../../services/observability/tracing');
      const { initMetrics } = await import('../../services/observability/metrics');
      const tracingEnabled = await initTracing();
      if (tracingEnabled) {
        await initMetrics();
      }
      logger.info('Observability initialized', { operation: 'startup', tracing: tracingEnabled });
    } catch (error) {
      logger.warn('Observability initialization failed (non-critical)', {
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Phase 73: Initialize AI tracing after DB is ready
    try {
      const { queryPublic: qp } = await import('../../utils/database-context');
      const { initAITracing } = await import('../../services/observability/ai-trace');
      initAITracing(qp);
    } catch (error) {
      logger.warn('AI tracing initialization failed (non-critical)', {
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onShutdown(): Promise<void> {
    try {
      const { shutdownTracing } = await import('../../services/observability/tracing');
      await shutdownTracing();
    } catch { /* ignore */ }
    try {
      const { shutdownAITracing } = await import('../../services/observability/ai-trace');
      await shutdownAITracing();
    } catch { /* ignore */ }
  }
}
