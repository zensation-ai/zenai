import type { Express } from 'express';
import type { Module } from '../../core/module';
import feedbackAdaptiveRouter from '../../routes/feedback-adaptive';

export class FeedbackAdaptiveModule implements Module {
  name = 'feedback-adaptive';

  registerRoutes(app: Express): void {
    // Phase 141: Feedback & Adaptive Behavior API
    app.use('/api', feedbackAdaptiveRouter);
  }
}
