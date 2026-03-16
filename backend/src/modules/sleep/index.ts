import type { Express } from 'express';
import type { Module } from '../../core/module';
import { sleepComputeRouter } from '../../routes/sleep-compute';

export class SleepModule implements Module {
  name = 'sleep';

  registerRoutes(app: Express): void {
    // Phase 63: Sleep Compute + Context Engine V2
    app.use('/api', sleepComputeRouter);
  }
}
