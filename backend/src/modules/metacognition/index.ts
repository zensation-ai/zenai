import type { Express } from 'express';
import type { Module } from '../../core/module';
import metacognitionRouter from '../../routes/metacognition';
import selfImprovementRouter from '../../routes/self-improvement';

export class MetacognitionModule implements Module {
  name = 'metacognition';

  registerRoutes(app: Express): void {
    // Phase 135-136: Metacognitive State, Calibration, Capability Model
    app.use('/api', metacognitionRouter);
    // Phase 141: Self-Improvement Engine
    app.use('/api', selfImprovementRouter);
  }
}
