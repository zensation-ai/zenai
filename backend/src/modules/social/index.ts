import type { Express } from 'express';
import type { Module } from '../../core/module';
import socialRouter from '../../routes/social';
import socialOAuthRouter from '../../routes/social-oauth';
import { registerSocialEventHandlers } from '../../services/social/social-event-handler';
import { seedSocialRules } from '../../services/social/seed-social-rules';
import { startMetricsWorker } from '../../services/social/metrics-worker';

export class SocialModule implements Module {
  name = 'social';

  registerRoutes(app: Express): void {
    app.use('/api', socialRouter);
    app.use('/api/social/oauth', socialOAuthRouter);
  }

  async onStartup(): Promise<void> {
    registerSocialEventHandlers();
    startMetricsWorker();

    // Seed default proactive rules (non-blocking, graceful degradation)
    seedSocialRules('finance').catch(() => { /* table may not exist yet */ });
  }
}

export default new SocialModule();
