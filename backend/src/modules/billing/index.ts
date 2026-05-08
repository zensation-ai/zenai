import type { Express } from 'express';
import type { Module } from '../../core/module';
import { billingRouter } from '../../routes/billing';

export class BillingModule implements Module {
  name = 'billing';

  registerRoutes(app: Express): void {
    // Billing: checkout, portal, subscription status, webhook
    app.use('/api/billing', billingRouter);
  }
}
