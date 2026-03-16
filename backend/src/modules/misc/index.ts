import type { Express } from 'express';
import type { Module } from '../../core/module';
import { a2aRouter } from '../../routes/a2a';

export class MiscModule implements Module {
  name = 'misc';

  registerRoutes(app: Express): void {
    // Phase 60: A2A Protocol
    app.use('/api', a2aRouter);
  }
}
