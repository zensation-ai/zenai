import type { Express } from 'express';
import type { Module } from '../../core/module';
import curiosityRouter from '../../routes/curiosity';

export class CuriosityModule implements Module {
  name = 'curiosity';

  registerRoutes(app: Express): void {
    // Phase 141: Curiosity Engine API (gaps, hypotheses, information gain)
    app.use('/api', curiosityRouter);
  }
}
