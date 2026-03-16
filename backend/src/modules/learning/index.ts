import type { Express } from 'express';
import type { Module } from '../../core/module';
import { learningTasksRouter } from '../../routes/learning-tasks';
import { intelligentLearningRouter } from '../../routes/intelligent-learning';
import { automationsRouter } from '../../routes/automations';
import { interactionsRouter } from '../../routes/interactions';
import { evolutionRouter } from '../../routes/analytics-evolution';
import { productivityRouter } from '../../routes/productivity';

export class LearningModule implements Module {
  name = 'learning';

  registerRoutes(app: Express): void {
    // Phase 22: Learning Tasks
    app.use('/api', learningTasksRouter);
    // Phase 23: Intelligent Learning System
    app.use('/api', intelligentLearningRouter);
    // Phase 3 (Vision): Automation Registry
    app.use('/api', automationsRouter);
    // Phase 4 (Vision): Interaction Tracking
    app.use('/api', interactionsRouter);
    // Phase 5 (Vision): Evolution Analytics
    app.use('/api', evolutionRouter);
    // Phase 32D: Productivity Analytics
    app.use('/api', productivityRouter);
  }
}
