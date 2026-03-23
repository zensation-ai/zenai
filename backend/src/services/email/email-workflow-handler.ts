/**
 * Email Workflow Handler (Phase 3C)
 *
 * Orchestrates automatic email analysis and smart suggestion creation
 * for newly synced Gmail messages.
 */

import { queryContext, AIContext } from '../../utils/database-context';
import { logger } from '../../utils/logger';
import { processEmailWithAI } from '../email-ai';
import { createSuggestion } from '../smart-suggestions';

// ============================================================
// processUnanalyzedEmails
// ============================================================

/**
 * Finds up to 10 Gmail emails that have not yet been AI-processed
 * and calls processEmailWithAI for each. Errors on individual emails
 * are caught so the remaining emails continue processing.
 */
export async function processUnanalyzedEmails(context: AIContext): Promise<void> {
  const result = await queryContext(
    context,
    `SELECT id FROM emails
     WHERE provider = 'gmail' AND ai_processed_at IS NULL
     LIMIT 10`,
    []
  );

  if (result.rows.length === 0) {
    logger.debug('No unanalyzed emails found', { context });
    return;
  }

  logger.info('Processing unanalyzed emails', { context, count: result.rows.length });

  for (const row of result.rows) {
    try {
      await processEmailWithAI(context, row.id as string);
    } catch (err) {
      logger.warn('Failed to process email with AI', {
        context,
        emailId: row.id,
        error: (err as Error).message,
      });
    }
  }
}

// ============================================================
// createEmailSuggestions
// ============================================================

/**
 * Queries emails that were analyzed in the last 5 minutes and creates
 * smart suggestions based on their AI analysis results.
 */
export async function createEmailSuggestions(context: AIContext): Promise<void> {
  const result = await queryContext(
    context,
    `SELECT id, subject, from_address, ai_priority, ai_action_items, ai_category
     FROM emails
     WHERE ai_processed_at > now() - interval '5 minutes'`,
    []
  );

  if (result.rows.length === 0) {
    logger.debug('No recently analyzed emails for suggestions', { context });
    return;
  }

  for (const email of result.rows) {
    const emailId = email.id as string;
    const subject = (email.subject as string) || '(kein Betreff)';
    const fromAddress = (email.from_address as string) || '';
    const priority = email.ai_priority as string | null;
    const category = email.ai_category as string | null;

    // Parse ai_action_items (stored as JSONB — may come back as string or array)
    let actionItems: Array<{ text: string }> = [];
    if (email.ai_action_items) {
      try {
        const raw = email.ai_action_items;
        actionItems = typeof raw === 'string' ? JSON.parse(raw) : (raw as Array<{ text: string }>);
        if (!Array.isArray(actionItems)) {
          actionItems = [];
        }
      } catch {
        actionItems = [];
      }
    }

    // Check dedup: skip if an active suggestion already references this email
    const dedupResult = await queryContext(
      context,
      `SELECT id FROM smart_suggestions
       WHERE metadata->>'email_id' = $1 AND status = 'active'
       LIMIT 1`,
      [emailId]
    );

    if (dedupResult.rows.length > 0) {
      logger.debug('Skipping email suggestion (duplicate)', { context, emailId });
      continue;
    }

    // Determine suggestion type and title
    if (priority === 'urgent' || priority === 'high') {
      await createSuggestion(context, {
        userId: 'system',
        type: 'email_reply' as any,
        title: `Auf "${subject}" von ${fromAddress} antworten`,
        metadata: { email_id: emailId },
      });
    } else if (actionItems.length > 0) {
      await createSuggestion(context, {
        userId: 'system',
        type: 'email_task' as any,
        title: `${actionItems.length} Aufgaben aus "${subject}" erstellen`,
        metadata: { email_id: emailId, action_items: actionItems },
      });
    } else if (category === 'meeting') {
      await createSuggestion(context, {
        userId: 'system',
        type: 'email_calendar' as any,
        title: `Meeting "${subject}" zum Kalender hinzufügen`,
        metadata: { email_id: emailId },
      });
    }
  }
}

// ============================================================
// handleNewEmails
// ============================================================

/**
 * Entry point: process unanalyzed emails, then create suggestions
 * from the results of the analysis.
 */
export async function handleNewEmails(context: AIContext): Promise<void> {
  await processUnanalyzedEmails(context);
  await createEmailSuggestions(context);
}
