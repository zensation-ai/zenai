import type { Express } from 'express';
import type { Module } from '../../core/module';
import { healthRouter } from '../../routes/health';

/**
 * Health Module — Registered FIRST (before any module that applies apiKeyAuth
 * globally on a router mounted at /api). This ensures /api/health is accessible
 * without authentication for monitoring tools and load balancers.
 */
export class HealthModule implements Module {
  name = 'health';

  registerRoutes(app: Express): void {
    app.use('/api/health', healthRouter);
  }
}
