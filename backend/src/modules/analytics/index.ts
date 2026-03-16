import type { Express } from 'express';
import type { Module } from '../../core/module';
import { analyticsV2Router } from '../../routes/analytics-v2';
import { i18nRouter } from '../../routes/i18n';

export class AnalyticsModule implements Module {
  name = 'analytics-v2';

  registerRoutes(app: Express): void {
    // Phase 50: Analytics V2
    app.use('/api', analyticsV2Router);
    // Phase 52: i18n
    app.use('/api', i18nRouter);
  }
}
