import type { Express } from 'express';
import type { Module } from '../../core/module';
import { canvasRouter } from '../../routes/canvas';

export class CanvasModule implements Module {
  name = 'canvas';

  registerRoutes(app: Express): void {
    // Phase 33 Sprint 4: Interactive Canvas Mode
    app.use('/api/canvas', canvasRouter);
  }
}
