/**
 * Email Webhook Routes - Phase 38
 *
 * Receives inbound email events from Resend via webhook.
 * No API key auth — uses Svix signature verification instead.
 */

import { Router, Request, Response } from 'express';
import { verifyWebhook, isResendConfigured, isWebhookConfigured, getInboundEmail, ResendWebhookEvent } from '../services/resend';
import { queryPublic, queryContext, AIContext } from '../utils/database-context';
import { SYSTEM_USER_ID } from '../utils/user-context';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export const emailWebhooksRouter = Router();

// ============================================================
// Domain → Context Mapping
// ============================================================

interface DomainMapping {
  domain: string;
  defaultContext: AIContext;
}

const DOMAIN_MAPPINGS: DomainMapping[] = [
  { domain: 'zensation.ai', defaultContext: 'work' },
  { domain: 'zensation.app', defaultContext: 'personal' },
  { domain: 'joint-sales.com', defaultContext: 'work' },
];

function getContextForRecipient(toAddresses: string[]): AIContext {
  for (const addr of toAddresses) {
    const domain = addr.split('@')[1]?.toLowerCase();
    if (domain) {
      const mapping = DOMAIN_MAPPINGS.find(m => m.domain === domain);
      if (mapping) {return mapping.defaultContext;}
    }
  }
  return 'work'; // default fallback
}

function extractNameAndAddress(from: string): { name: string | null; address: string } {
  // Parse "Name <email>" or just "email"
  const match = from.match(/^(.+?)\s*<([^>]+)>$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim() };
  }
  return { name: null, address: from.trim() };
}

// ============================================================
// POST /api/webhooks/resend
// ============================================================

// NOTE: Intentionally NOT using asyncHandler here. Webhook endpoints must always
// return 200 to prevent the provider (Resend) from retrying. The manual try-catch
// ensures we respond with 200 regardless of processing outcome.
emailWebhooksRouter.post('/resend', async (req: Request, res: Response) => {
  try {
    // Check if Resend is configured
    if (!isResendConfigured()) {
      logger.warn('Resend webhook received but RESEND_API_KEY not configured', { operation: 'resendWebhook' });
      return res.status(200).json({ received: true, processed: false });
    }

    // Verify webhook signature if secret is configured
    let event: ResendWebhookEvent;

    if (isWebhookConfigured()) {
      const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
      if (!rawBody) {
        logger.warn('Missing raw body for webhook verification', { operation: 'resendWebhook' });
        return res.status(400).json({ error: 'Missing raw body' });
      }

      try {
        event = verifyWebhook(rawBody, req.headers as Record<string, string>);
      } catch (err) {
        logger.warn('Resend webhook signature verification failed', {
          error: (err as Error).message,
          operation: 'resendWebhook',
        });
        return res.status(401).json({ error: 'Invalid signature' });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // CRITICAL: Never skip signature verification in production
      logger.error('RESEND_WEBHOOK_SECRET not configured in production — rejecting webhook', undefined, { operation: 'resendWebhook' });
      return res.status(403).json({ error: 'Webhook verification not configured' });
    } else {
      // In development only, accept without verification
      event = req.body as ResendWebhookEvent;
      logger.warn('Processing unverified Resend webhook (dev mode, RESEND_WEBHOOK_SECRET not set)', { operation: 'resendWebhook' });
    }

    // Log the webhook event
    const context = getContextForRecipient(event.data?.to || []);

    await queryPublic(`
      INSERT INTO resend_webhook_log (event_type, resend_email_id, payload, target_context)
      VALUES ($1, $2, $3, $4)
    `, [event.type, event.data?.email_id || null, JSON.stringify(event), context]);

    // Process based on event type
    if (event.type === 'email.received') {
      await processInboundEmail(event, context);
    } else {
      logger.info('Resend webhook event (non-inbound)', {
        type: event.type,
        emailId: event.data?.email_id,
        operation: 'resendWebhook',
      });
    }

    // Always respond 200 to acknowledge receipt
    return res.status(200).json({ received: true, processed: true });
  } catch (err) {
    logger.error('Resend webhook processing error', err instanceof Error ? err : undefined, {
      operation: 'resendWebhook',
    });
    // Still return 200 to prevent Resend from retrying
    return res.status(200).json({ received: true, processed: false });
  }
});

// ============================================================
// Process Inbound Email
// ============================================================

async function processInboundEmail(event: ResendWebhookEvent, context: AIContext): Promise<void> {
  const { data } = event;
  const id = uuidv4();

  const { name: fromName, address: fromAddress } = extractNameAndAddress(data.from);

  // Get email body: prefer webhook payload fields, fallback to API
  let bodyHtml: string | null = data.html || null;
  let bodyText: string | null = data.text || null;

  if (!bodyHtml && !bodyText) {
    try {
      const fullEmail = await getInboundEmail(data.email_id);
      bodyHtml = fullEmail.html;
      bodyText = fullEmail.text;
    } catch (err) {
      logger.warn('Failed to fetch full email body, storing without body', {
        emailId: data.email_id,
        error: (err as Error).message,
        operation: 'processInboundEmail',
      });
    }
  }

  // Truncate email body to prevent excessive storage and AI processing costs
  const MAX_BODY_LENGTH = 100_000; // 100KB
  if (bodyHtml && bodyHtml.length > MAX_BODY_LENGTH) {
    bodyHtml = bodyHtml.substring(0, MAX_BODY_LENGTH) + '\n<!-- truncated -->';
  }
  if (bodyText && bodyText.length > MAX_BODY_LENGTH) {
    bodyText = bodyText.substring(0, MAX_BODY_LENGTH) + '\n[truncated]';
  }

  // Map recipient addresses to JSON
  const toAddresses = (data.to || []).map(addr => {
    const parsed = extractNameAndAddress(addr);
    return { email: parsed.address, name: parsed.name };
  });

  const ccAddresses = (data.cc || []).map(addr => {
    const parsed = extractNameAndAddress(addr);
    return { email: parsed.address, name: parsed.name };
  });

  // Map attachments
  const attachments = (data.attachments || []).map(a => ({
    id: a.id,
    filename: a.filename,
    content_type: a.content_type,
    content_disposition: a.content_disposition,
    content_id: a.content_id || null,
  }));

  const hasAttachments = attachments.length > 0;

  // Find matching account by recipient domain (not sender domain)
  const recipientDomains = toAddresses.map(a => a.email.split('@')[1]).filter(Boolean);
  const accountResult = await queryContext(context, `
    SELECT id FROM email_accounts
    WHERE domain = ANY($1::text[])
    LIMIT 1
  `, [recipientDomains]);

  const accountId = accountResult.rows[0]?.id || null;

  // Thread detection: look for existing thread by in_reply_to or message_id references
  let threadId: string | null = null;

  // 1) Check if we have an In-Reply-To header (most reliable for threading)
  const inReplyTo = (data as Record<string, unknown>).in_reply_to as string | undefined;
  if (inReplyTo) {
    const threadResult = await queryContext(context, `
      SELECT thread_id FROM emails
      WHERE message_id = $1
      LIMIT 1
    `, [inReplyTo]);
    threadId = threadResult.rows[0]?.thread_id || null;
  }

  // 2) Check by subject line threading (Re: / Fwd:)
  if (!threadId && data.subject) {
    const baseSubject = data.subject.replace(/^(Re|Fwd|AW|WG):\s*/gi, '').trim();
    if (baseSubject && baseSubject !== data.subject) {
      const threadResult = await queryContext(context, `
        SELECT thread_id FROM emails
        WHERE subject = $1 OR subject = $2
        ORDER BY received_at DESC
        LIMIT 1
      `, [baseSubject, data.subject]);
      threadId = threadResult.rows[0]?.thread_id || null;
    }
  }

  // 3) If no existing thread found, start a new one
  if (!threadId) {
    threadId = id;
  }

  // Insert the email
  await queryContext(context, `
    INSERT INTO emails (
      id, user_id, resend_email_id, account_id, direction, status,
      from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
      subject, body_html, body_text,
      thread_id, message_id, in_reply_to, has_attachments, attachments,
      context, received_at, created_at, updated_at
    ) VALUES (
      $1, $18, $2, $3, 'inbound', 'received',
      $4, $5, $6, $7, '[]'::jsonb,
      $8, $9, $10,
      $11, $12, $13, $14, $15,
      $16, $17, NOW(), NOW()
    )
  `, [
    id, data.email_id, accountId,
    fromAddress, fromName, JSON.stringify(toAddresses), JSON.stringify(ccAddresses),
    data.subject || '(Kein Betreff)',
    bodyHtml, bodyText,
    threadId, data.message_id || null, inReplyTo || null,
    hasAttachments, JSON.stringify(attachments),
    context, data.created_at || new Date().toISOString(),
    SYSTEM_USER_ID,
  ]);

  // Mark webhook as processed
  await queryPublic(`
    UPDATE resend_webhook_log
    SET processed = TRUE
    WHERE resend_email_id = $1 AND event_type = 'email.received'
  `, [data.email_id]);

  logger.info('Inbound email stored', {
    id,
    from: fromAddress,
    subject: data.subject,
    context,
    hasAttachments,
    operation: 'processInboundEmail',
  });

  // Emit system event for proactive engine
  import('../services/event-system').then(({ emitSystemEvent }) =>
    emitSystemEvent({ context, eventType: 'email.received', eventSource: 'email_webhook', payload: { emailId: id, from: fromAddress, subject: data.subject } })
  ).catch(err => {
    logger.warn('Failed to emit email.received event', { error: err instanceof Error ? err.message : String(err), emailId: id });
  });

  // Queue AI processing (fire-and-forget)
  processEmailWithAIAsync(context, id).catch(err => {
    logger.error('Async AI email processing failed', err instanceof Error ? err : undefined, {
      emailId: id,
      operation: 'processEmailWithAI',
    });
  });

  // Phase 43: Re-summarize thread if this email joins an existing thread
  if (threadId && threadId !== id) {
    resummarizeThreadAsync(context, threadId).catch(err => {
      logger.warn('Async thread re-summarization failed', {
        threadId,
        error: (err as Error).message,
        operation: 'resummarizeThread',
      });
    });
  }
}

// ============================================================
// Async AI Processing (placeholder - implemented in email-ai.ts)
// ============================================================

/**
 * Phase 43: Re-summarize a thread when a new email arrives.
 * Updates thread summary so "Ask My Inbox" has current context.
 */
async function resummarizeThreadAsync(context: AIContext, threadId: string): Promise<void> {
  try {
    const { summarizeThread } = await import('../services/email-ai');
    const summary = await summarizeThread(context, threadId);

    // Store updated summary as metadata on the first email of the thread
    await queryContext(context, `
      UPDATE emails SET
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('thread_summary', $2, 'thread_summary_at', NOW()::text),
        updated_at = NOW()
      WHERE thread_id = $1 AND id = $1
    `, [threadId, summary]);

    logger.info('Thread re-summarized', { threadId, summaryLength: summary.length, operation: 'resummarizeThread' });
  } catch (err) {
    logger.warn('Thread re-summarization not available', {
      threadId,
      error: (err as Error).message,
      operation: 'resummarizeThreadAsync',
    });
  }
}

async function processEmailWithAIAsync(context: AIContext, emailId: string): Promise<void> {
  try {
    // Dynamic import to avoid circular dependency
    const { processEmailWithAI } = await import('../services/email-ai');
    await processEmailWithAI(context, emailId);
  } catch (err) {
    logger.warn('AI email processing not available', {
      emailId,
      error: (err as Error).message,
      operation: 'processEmailWithAIAsync',
    });
  }
}
