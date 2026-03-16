import type { Express } from 'express';
import type { Module } from '../../core/module';
import { thinkingRouter } from '../../routes/thinking';
import { ragAnalyticsRouter } from '../../routes/rag-analytics';
import { graphReasoningRouter } from '../../routes/graph-reasoning';
import { graphragRouter } from '../../routes/graphrag';
import { ragV2Router } from '../../routes/rag-v2';

export class KnowledgeModule implements Module {
  name = 'knowledge';

  registerRoutes(app: Express): void {
    // Phase 46: Extended Thinking Excellence
    app.use('/api', thinkingRouter);
    // Phase 47: RAG Analytics & Feedback
    app.use('/api', ragAnalyticsRouter);
    // Phase 48: Knowledge Graph Reasoning
    app.use('/api', graphReasoningRouter);
    // Phase 58: GraphRAG + Hybrid Retrieval
    app.use('/api', graphragRouter);
    // Phase 49: Advanced RAG v2
    app.use('/api', ragV2Router);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Restore persisted thinking budget strategies
    try {
      const { loadPersistedStrategies } = await import('../../services/thinking-management');
      await loadPersistedStrategies('personal' as const);
      logger.info('Thinking budget strategies restored (deferred)', { operation: 'startup' });
    } catch (error) {
      logger.error('Thinking strategies restore failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }
}
