import type { Express } from 'express';
import type { Module } from '../../core/module';
import { draftsRouter } from '../../routes/drafts';

export class IdeasModule implements Module {
  name = 'ideas';

  registerRoutes(app: Express): void {
    // Phase 25: Proactive Draft Generation
    app.use('/api', draftsRouter);
  }
}
