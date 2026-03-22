import type { Express } from 'express';
import type { Module } from '../../core/module';
import metacognitionRouter from '../../routes/metacognition';

export class MetacognitionModule implements Module {
  name = 'metacognition';

  registerRoutes(app: Express): void {
    // Phase 135-136: Metacognitive State, Calibration, Capability Model
    app.use('/api', metacognitionRouter);
  }
}
