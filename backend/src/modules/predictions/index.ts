import type { Express } from 'express';
import type { Module } from '../../core/module';
import predictionsRouter from '../../routes/predictions';

export class PredictionsModule implements Module {
  name = 'predictions';

  registerRoutes(app: Express): void {
    // Phase 141: Predictions API (history, patterns, accuracy, next)
    app.use('/api', predictionsRouter);
  }
}
