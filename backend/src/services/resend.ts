/**
 * Resend Service - Phase 38 Email Integration
 *
 * Wrapper around the Resend SDK for sending emails, fetching inbound
 * email content, and verifying webhook signatures.
 */

import { Resend } from 'resend';
import { Webhook } from 'svix';
import { logger } from '../utils/logger';

// ============================================================
// Configuration
// ============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;
const DEFAULT_FROM = process.env.RESEND_DEFAULT_FROM || 'noreply@zensation.ai';

let resendClient: Resend | null = null;

function getClient(): Resend {
  if (!resendClient) {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    resendClient = new Resend(RESEND_API_KEY);
  }
  return resendClient;
}

// ============================================================
// Public API
// ============================================================

export function isResendConfigured(): boolean {
  return !!RESEND_API_KEY;
}

export function isWebhookConfigured(): boolean {
  return !!RESEND_WEBHOOK_SECRET;
}

// ============================================================
// Send Email
// ============================================================

export interface SendEmailOptions {
  from?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: string;  // base64
    path?: string;     // URL
    contentType?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  id: string;
}

export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const client = getClient();

  // Build params, omitting undefined values to satisfy Resend SDK types
  const params: Record<string, unknown> = {
    from: options.from || DEFAULT_FROM,
    to: options.to,
    subject: options.subject,
  };
  if (options.cc) params.cc = options.cc;
  if (options.bcc) params.bcc = options.bcc;
  if (options.replyTo) params.replyTo = options.replyTo;
  if (options.html) params.html = options.html;
  if (options.text) params.text = options.text;
  if (options.tags) params.tags = options.tags;
  if (options.headers) params.headers = options.headers;
  if (options.attachments) {
    params.attachments = options.attachments.map(a => ({
      filename: a.filename,
      content: a.content ? Buffer.from(a.content, 'base64') : undefined,
      path: a.path,
      contentType: a.contentType,
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await client.emails.send(params as any);

  if (error) {
    logger.error('Resend send error', undefined, { errorMsg: error.message, to: options.to, operation: 'sendEmail' });
    throw new Error(`Resend send failed: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Resend returned success but no email ID');
  }

  logger.info('Email sent via Resend', { id: data.id, to: options.to, subject: options.subject, operation: 'sendEmail' });
  return { id: data.id };
}

// ============================================================
// Inbound Email Retrieval
// ============================================================

export interface InboundEmail {
  id: string;
  from: string;
  to: string;
  cc: string | null;
  bcc: string | null;
  subject: string;
  text: string | null;
  html: string | null;
  headers: Record<string, string>;
  createdAt: string;
}

export async function getInboundEmail(emailId: string): Promise<InboundEmail> {
  const client = getClient();

  // Use the Receiving API — emails.get() only works for outbound emails
  // See: https://resend.com/docs/dashboard/receiving/get-email-content
  const { data, error } = await client.emails.receiving.get(emailId);

  if (error) {
    logger.error('Resend receiving.get error', undefined, { emailId, errorMsg: error.message, operation: 'getInboundEmail' });
    throw new Error(`Failed to get inbound email: ${error.message}`);
  }

  return data as unknown as InboundEmail;
}

export interface InboundAttachment {
  filename: string;
  content_type: string;
  content_length: number;
  content_id: string | null;
  expires_at: string;
  download_url: string;
}

export async function getInboundAttachments(_emailId: string): Promise<InboundAttachment[]> {
  // Note: Resend's attachment API requires separate endpoint call
  // For now, we extract attachment metadata from the webhook payload
  // Full attachment download can be implemented when needed
  logger.debug('Attachment retrieval placeholder', { _emailId, operation: 'getInboundAttachments' });
  return [];
}

// ============================================================
// Webhook Signature Verification
// ============================================================

export interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    cc: string[];
    bcc: string[];
    subject: string;
    message_id?: string;
    // Inbound email body (available in email.received events)
    html?: string;
    text?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      content_disposition: string;
      content_id?: string;
    }>;
    created_at: string;
  };
}

/**
 * Verify Resend webhook signature using Svix.
 * Returns the parsed event if valid, throws if invalid.
 */
export function verifyWebhook(
  payload: string | Buffer,
  headers: Record<string, string>
): ResendWebhookEvent {
  if (!RESEND_WEBHOOK_SECRET) {
    throw new Error('RESEND_WEBHOOK_SECRET is not configured');
  }

  const wh = new Webhook(RESEND_WEBHOOK_SECRET);

  // Svix expects these headers
  const svixHeaders = {
    'svix-id': headers['svix-id'] || '',
    'svix-timestamp': headers['svix-timestamp'] || '',
    'svix-signature': headers['svix-signature'] || '',
  };

  const event = wh.verify(
    typeof payload === 'string' ? payload : payload.toString('utf8'),
    svixHeaders
  ) as ResendWebhookEvent;

  return event;
}
