/**
 * Email Webhook Routes - Phase 38
 *
 * Receives inbound email events from Resend via webhook.
 * No API key auth — uses Svix signature verification instead.
 */

import { Router, Request, Response } from 'express';
import { verifyWebhook, isResendConfigured, isWebhookConfigured, getInboundEmail, ResendWebhookEvent } from '../services/resend';
import { queryPublic, queryContext, AIContext } from '../utils/database-context';
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
      if (mapping) return mapping.defaultContext;
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
    } else {
      // In development, accept without verification
      event = req.body as ResendWebhookEvent;
      logger.warn('Processing unverified Resend webhook (RESEND_WEBHOOK_SECRET not set)', { operation: 'resendWebhook' });
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

  // Find matching account for context routing
  const accountResult = await queryContext(context, `
    SELECT id FROM email_accounts
    WHERE domain = $1
    LIMIT 1
  `, [fromAddress.split('@')[1] || '']);

  const accountId = accountResult.rows[0]?.id || null;

  // Thread detection: look for existing thread by message_id / in_reply_to
  let threadId: string | null = null;
  if (data.message_id) {
    const threadResult = await queryContext(context, `
      SELECT thread_id FROM emails
      WHERE message_id = $1 OR resend_email_id = $1
      LIMIT 1
    `, [data.message_id]);
    threadId = threadResult.rows[0]?.thread_id || null;
  }

  // If no existing thread, start a new one
  if (!threadId) {
    threadId = id; // Use the email's own ID as thread root
  }

  // Insert the email
  await queryContext(context, `
    INSERT INTO emails (
      id, resend_email_id, account_id, direction, status,
      from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
      subject, body_html, body_text,
      thread_id, message_id, has_attachments, attachments,
      context, received_at, created_at, updated_at
    ) VALUES (
      $1, $2, $3, 'inbound', 'received',
      $4, $5, $6, $7, '[]'::jsonb,
      $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, NOW(), NOW()
    )
  `, [
    id, data.email_id, accountId,
    fromAddress, fromName, JSON.stringify(toAddresses), JSON.stringify(ccAddresses),
    data.subject || '(Kein Betreff)',
    bodyHtml, bodyText,
    threadId, data.message_id || null,
    hasAttachments, JSON.stringify(attachments),
    context, data.created_at || new Date().toISOString(),
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

  // Queue AI processing (fire-and-forget)
  processEmailWithAIAsync(context, id).catch(err => {
    logger.error('Async AI email processing failed', err instanceof Error ? err : undefined, {
      emailId: id,
      operation: 'processEmailWithAI',
    });
  });
}

// ============================================================
// Async AI Processing (placeholder - implemented in email-ai.ts)
// ============================================================

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
