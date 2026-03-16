import type { Express } from 'express';
import type { Module } from '../../core/module';
import { emailWebhooksRouter } from '../../routes/email-webhooks';
import { emailRouter } from '../../routes/email';

export class EmailModule implements Module {
  name = 'email';

  registerRoutes(app: Express): void {
    // Phase 38: Email Webhooks - MUST be before webhooksRouter to avoid /:id catch-all with apiKeyAuth
    app.use('/api/webhooks', emailWebhooksRouter);
    // Phase 38: Email Integration (Resend) - emailRouter for CRUD
    app.use('/api', emailRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');

    // Start IMAP Sync Scheduler
    try {
      const { startImapScheduler } = await import('../../services/imap-sync');
      startImapScheduler();
    } catch (error) {
      logger.error('IMAP Scheduler failed to start (non-critical)', error instanceof Error ? error : undefined, { operation: 'startup' });
    }
  }

  async onShutdown(): Promise<void> {
    try {
      const { stopImapScheduler } = await import('../../services/imap-sync');
      stopImapScheduler();
    } catch { /* ignore */ }
  }
}
