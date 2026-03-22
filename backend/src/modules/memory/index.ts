import type { Express } from 'express';
import type { Module } from '../../core/module';
import { memoryInsightsRouter } from '../../routes/memory-insights';
import { memoryProceduresRouter } from '../../routes/memory-procedures';
import { prospectiveMemoryRouter } from '../../routes/prospective-memory';
import fsrsReviewRouter from '../../routes/fsrs-review';

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
  }

  async onShutdown(): Promise<void> {
    try {
      const { stopMemoryScheduler, workingMemory } = await import('../../services/memory');
      stopMemoryScheduler();
      workingMemory.stopCleanupInterval();
    } catch { /* ignore */ }
  }
}
