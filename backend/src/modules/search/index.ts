import type { Express } from 'express';
import type { Module } from '../../core/module';
import { globalSearchRouter } from '../../routes/global-search';

export class SearchModule implements Module {
  name = 'search';

  registerRoutes(app: Express): void {
    // Phase 37: Global Search - Must be before context-aware routes
    app.use('/api/search', globalSearchRouter);
  }
}
