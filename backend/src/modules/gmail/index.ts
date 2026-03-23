import type { Express } from 'express';
import type { Module } from '../../core/module';
import { googleOAuthRouter } from '../../routes/google-oauth';

export class GmailModule implements Module {
  name = 'gmail';
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  registerRoutes(app: Express): void {
    app.use('/api/auth/oauth/google', googleOAuthRouter);
  }

  async onStartup(): Promise<void> {
    const { logger } = await import('../../utils/logger');
    const { getQueueService } = await import('../../services/queue/job-queue');

    const queueService = getQueueService();
    if (!queueService.isAvailable()) {
      logger.info('Gmail sync scheduler skipped (Redis not available)', { operation: 'startup' });
      return;
    }

    this.syncInterval = setInterval(async () => {
      try {
        const { scheduleGmailSyncJobs } = await import('../../services/queue/workers/gmail-sync-worker');
        const jobs = await scheduleGmailSyncJobs();
        for (const job of jobs) {
          await queueService.enqueue(
            'gmail-sync',
            `sync-${job.accountId}`,
            job as unknown as Record<string, unknown>,
            { attempts: 2, backoff: { type: 'exponential', delay: 2000 } }
          );
        }
      } catch (err) {
        logger.error('Gmail sync scheduler error', err instanceof Error ? err : undefined);
      }
    }, 60_000);

    logger.info('Gmail sync scheduler started (60s interval)', { operation: 'startup' });

    try {
      const { seedEmailWorkflowConfig } = await import('../../services/email/email-workflow-rules');
      await seedEmailWorkflowConfig();
    } catch (err) {
      logger.debug('Email workflow config seeding failed (non-critical)', { error: (err as Error).message });
    }
  }

  async onShutdown(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}
