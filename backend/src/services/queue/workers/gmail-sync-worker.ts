/**
 * Phase 3A: Gmail Sync Worker
 * Scheduler finds eligible accounts, per-account jobs run incremental sync.
 */

import { pool } from '../../../utils/database';
import type { AIContext } from '../../../utils/database-context';
import { GmailProvider } from '../../email/gmail-provider';
import type { SyncResult } from '../../email/email-provider';
import { logger } from '../../../utils/logger';

export interface GmailSyncJobPayload {
  accountId: string;
  context: AIContext;
  googleTokenId: string;
}

const gmailProvider = new GmailProvider();

export async function scheduleGmailSyncJobs(): Promise<GmailSyncJobPayload[]> {
  const result = await pool.query(`
    SELECT id, google_token_id, 'personal' as context FROM personal.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'work' FROM work.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'learning' FROM learning.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
    UNION ALL
    SELECT id, google_token_id, 'creative' FROM creative.email_accounts
      WHERE provider = 'gmail' AND google_token_id IS NOT NULL
        AND (last_sync_at IS NULL OR last_sync_at < now() - interval '55 seconds')
  `);

  return result.rows.map(row => ({
    accountId: row.id,
    context: row.context as AIContext,
    googleTokenId: row.google_token_id,
  }));
}

export async function processGmailSyncJob(payload: GmailSyncJobPayload): Promise<SyncResult> {
  const { accountId, context } = payload;
  logger.info('Gmail sync job started', { accountId, context });

  try {
    const result = await gmailProvider.syncIncremental(accountId, context);
    logger.info('Gmail sync job completed', {
      accountId, context,
      newMessages: result.newMessages,
      updatedMessages: result.updatedMessages,
      errors: result.errors.length,
    });

    if (result.newMessages > 0) {
      // Emit audit event (fire-and-forget)
      import('../../event-system').then(({ emitSystemEvent }) =>
        emitSystemEvent({
          context,
          eventType: 'email.received',
          eventSource: 'gmail-sync',
          payload: { accountId, newMessages: result.newMessages },
        })
      ).catch(err => logger.debug('Event emission failed', { error: (err as Error).message }));

      // Trigger email workflow
      try {
        const { handleNewEmails } = await import('../../email/email-workflow-handler');
        await handleNewEmails(context);
      } catch (err) {
        logger.warn('Email workflow handler failed', { error: (err as Error).message });
      }
    }

    return result;
  } catch (err) {
    logger.error('Gmail sync job failed', err instanceof Error ? err : undefined, { accountId, context });
    throw err;
  }
}
