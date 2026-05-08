import type { Express } from 'express';
import type { Module } from '../../core/module';
import { memoryInsightsRouter } from '../../routes/memory-insights';
import { memoryProceduresRouter } from '../../routes/memory-procedures';
import { prospectiveMemoryRouter } from '../../routes/prospective-memory';
import fsrsReviewRouter from '../../routes/fsrs-review';
import pmaMemoryRouter from '../../routes/pma-memory-routes';

export class MemoryModule implements Module {
  name = 'memory';

  registerRoutes(app: Express): void {
    // Phase 53: Memory Insights
    app.use('/api', memoryInsightsRouter);
    // Phase 59: Memory Excellence - Procedural Memory & BM25
    app.use('/api', memoryProceduresRouter);
    // Phase 87: Prospective Memory + Metamemory
    app.use('/api', prospectiveMemoryRouter);
    // Phase 141: FSRS Spaced Repetition Review Queue
    app.use('/api', fsrsReviewRouter);
    // PMA: Neuromodulators, Reconsolidation, Copies, Clusters
    app.use('/api', pmaMemoryRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Start Memory Scheduler (HiMeS Consolidation & Decay)
    try {
      const { startMemoryScheduler } = await import('../../services/memory');
      await startMemoryScheduler();
      logger.info('Memory Scheduler started successfully (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Memory Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }

    // Phase H4 binding: register Postgres-backed Hindsight store factory.
    // The factory is invoked per-context (operations / finance / people /
    // strategy) on each chat retrieval. Default OFF unless the env-flag
    // H4_HINDSIGHT_ROUTER is true OR a per-call enableHindsightRouter
    // option is set on the chat path. The wiring is unconditional — the
    // factory itself is cheap to register; the gate decides whether the
    // stores are actually queried at retrieval time.
    try {
      const { setHindsightStoreFactory } = await import(
        '../../services/memory/memory-coordinator'
      );
      const { createPostgresHindsightStores } = await import(
        '../../services/memory/hindsight-networks/postgres-stores'
      );
      setHindsightStoreFactory((ctx) => createPostgresHindsightStores(ctx));
      logger.info('Hindsight store factory registered (Postgres-backed)', {
        operation: 'startup',
      });
    } catch (error) {
      logger.warn('Hindsight store factory registration failed (non-critical)', {
        operation: 'startup',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async onShutdown(): Promise<void> {
    try {
      const { stopMemoryScheduler, workingMemory } = await import('../../services/memory');
      stopMemoryScheduler();
      workingMemory.stopCleanupInterval();
    } catch { /* ignore */ }
  }
}
