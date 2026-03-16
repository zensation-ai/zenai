import type { Express } from 'express';
import type { Module } from '../../core/module';
import { extensionsRouter } from '../../routes/extensions';
import { pluginsRouter } from '../../routes/plugins';

export class ExtensionsModule implements Module {
  name = 'extensions';

  registerRoutes(app: Express): void {
    // Phase 75: Extension/Plugin System
    app.use('/api/extensions', extensionsRouter);
    // Phase 51: Plugin System
    app.use('/api', pluginsRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Load active plugins from database
    try {
      const { loadActivePlugins } = await import('../../services/plugins/plugin-registry');
      const contexts = ['personal', 'work', 'learning', 'creative'] as const;
      for (const ctx of contexts) {
        await loadActivePlugins(ctx);
      }
      logger.info('Active plugins loaded (deferred)', { operation: 'startup' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('does not exist')) {
        logger.warn('Plugin loading skipped (table missing)', { operation: 'startup' });
      } else {
        logger.error('Plugin loading failed (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
      }
    }
  }
}
