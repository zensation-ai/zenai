import type { Express } from 'express';
import type { Module } from '../../core/module';
import { globalSearchRouter } from '../../routes/global-search';
import { semanticSearchRouter } from '../../routes/semantic-search';

export class SearchModule implements Module {
  name = 'search';

  registerRoutes(app: Express): void {
    // Phase 37: Global Search - Must be before context-aware routes
    app.use('/api/search', globalSearchRouter);
    // Phase 95: Semantic Search 2.0 — Universal Cross-Feature Search
    app.use('/api', semanticSearchRouter);
  }
}
