import type { Express } from 'express';
import type { Module } from '../../core/module';
import { businessRouter } from '../../routes/business';
import { businessNarrativeRouter } from '../../routes/business-narrative';

export class BusinessModule implements Module {
  name = 'business';

  registerRoutes(app: Express): void {
    // Phase 34: Business Manager - Must be before context-aware routes
    app.use('/api/business', businessRouter);
    // Phase 96: Cross-Context Business Narrative
    app.use('/api', businessNarrativeRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    try {
      const { initializeBusinessConnectors } = await import('../../services/business');
      await initializeBusinessConnectors();
      logger.info('Business Connectors initialized successfully', { operation: 'startup' });
    } catch (error) {
      logger.error('Business Connectors initialization failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }
}
