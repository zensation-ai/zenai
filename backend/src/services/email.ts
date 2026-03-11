/**
 * Email Service - Phase 38
 *
 * Context-aware email management with full CRUD, threading,
 * account management, and Resend integration for sending.
 */

import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { sendEmail as resendSendEmail, isResendConfigured } from './resend';
import { NotFoundError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

// ============================================================
// Types
// ============================================================

export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'received' | 'read' | 'draft' | 'sending' | 'sent' | 'failed' | 'archived' | 'trash';
export type EmailCategory = 'business' | 'personal' | 'newsletter' | 'notification' | 'spam';
export type EmailPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Email {
  id: string;
  resend_email_id: string | null;
  account_id: string | null;
  direction: EmailDirection;
  status: EmailStatus;
  from_address: string;
  from_name: string | null;
  to_addresses: Array<{ email: string; name?: string | null }>;
  cc_addresses: Array<{ email: string; name?: string | null }>;
  bcc_addresses: Array<{ email: string; name?: string | null }>;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  reply_to_id: string | null;
  thread_id: string | null;
  message_id: string | null;
  in_reply_to: string | null;
  has_attachments: boolean;
  attachments: Array<{ id?: string; filename: string; content_type: string; content_disposition?: string; content_id?: string | null; size?: number; download_url?: string }>;
  ai_summary: string | null;
  ai_category: EmailCategory | null;
  ai_priority: EmailPriority | null;
  ai_sentiment: string | null;
  ai_action_items: Array<{ text: string; done?: boolean }>;
  ai_reply_suggestions: Array<{ tone: string; subject?: string; body: string }>;
  ai_processed_at: string | null;
  labels: string[];
  is_starred: boolean;
  context: string;
  metadata: Record<string, unknown>;
  received_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  account_email?: string;
  account_display_name?: string;
  thread_count?: number;
}

export interface EmailFilters {
  status?: EmailStatus;
  direction?: EmailDirection;
  category?: string;
  account_id?: string;
  is_starred?: boolean;
  label?: string;
  search?: string;
  from?: string;
  thread_id?: string;
  folder?: string; // 'inbox' | 'sent' | 'drafts' | 'archived' | 'trash' | 'starred'
  limit?: number;
  offset?: number;
}

export interface CreateEmailInput {
  to_addresses: Array<{ email: string; name?: string }>;
  cc_addresses?: Array<{ email: string; name?: string }>;
  bcc_addresses?: Array<{ email: string; name?: string }>;
  subject?: string;
  body_html?: string;
  body_text?: string;
  account_id?: string;
  reply_to_id?: string;
  labels?: string[];
  metadata?: Record<string, unknown>;
}

export interface EmailAccount {
  id: string;
  email_address: string;
  display_name: string | null;
  domain: string;
  is_default: boolean;
  signature_html: string | null;
  signature_text: string | null;
  context: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // IMAP fields (Phase 39)
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_tls: boolean | null;
  imap_enabled: boolean;
  last_sync_uid: number | null;
  last_sync_uidvalidity: number | null;
  last_sync_at: string | null;
  sync_error: string | null;
  sync_folder: string | null;
}

export interface EmailLabel {
  id: string;
  name: string;
  color: string;
  icon: string;
  context: string;
  sort_order: number;
  created_at: string;
}

export interface EmailStats {
  total: number;
  unread: number;
  starred: number;
  by_category: Record<string, number>;
  by_account: Array<{ account_id: string; email: string; count: number }>;
}

// ============================================================
// Row Mapping
// ============================================================

function mapRowToEmail(row: Record<string, unknown>): Email {
  return {
    id: row.id as string,
    resend_email_id: row.resend_email_id as string | null,
    account_id: row.account_id as string | null,
    direction: row.direction as EmailDirection,
    status: row.status as EmailStatus,
    from_address: row.from_address as string,
    from_name: row.from_name as string | null,
    to_addresses: parseJson(row.to_addresses, []),
    cc_addresses: parseJson(row.cc_addresses, []),
    bcc_addresses: parseJson(row.bcc_addresses, []),
    subject: row.subject as string | null,
    body_html: row.body_html as string | null,
    body_text: row.body_text as string | null,
    reply_to_id: row.reply_to_id as string | null,
    thread_id: row.thread_id as string | null,
    message_id: row.message_id as string | null,
    in_reply_to: row.in_reply_to as string | null,
    has_attachments: row.has_attachments as boolean,
    attachments: parseJson(row.attachments, []),
    ai_summary: row.ai_summary as string | null,
    ai_category: row.ai_category as EmailCategory | null,
    ai_priority: row.ai_priority as EmailPriority | null,
    ai_sentiment: row.ai_sentiment as string | null,
    ai_action_items: parseJson(row.ai_action_items, []),
    ai_reply_suggestions: parseJson(row.ai_reply_suggestions, []),
    ai_processed_at: row.ai_processed_at as string | null,
    labels: parseJson(row.labels, []),
    is_starred: row.is_starred as boolean,
    context: row.context as string,
    metadata: parseJson(row.metadata, {}),
    received_at: row.received_at as string,
    sent_at: row.sent_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    account_email: row.account_email as string | undefined,
    account_display_name: row.account_display_name as string | undefined,
    thread_count: row.thread_count !== undefined ? Number(row.thread_count) : undefined,
  };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {return fallback;}
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return fallback; }
  }
  return value as T;
}

// ============================================================
// Get Emails (list with filters)
// ============================================================

export async function getEmails(
  context: AIContext,
  filters?: EmailFilters
): Promise<{ emails: Email[]; total: number }> {
  const conditions: string[] = [];
  const params: (string | number | boolean)[] = [];
  let paramIdx = 1;

  // Folder-based filtering (maps to status/direction combos)
  if (filters?.folder) {
    switch (filters.folder) {
      case 'inbox':
        conditions.push(`e.direction = 'inbound'`);
        conditions.push(`e.status NOT IN ('archived', 'trash')`);
        break;
      case 'sent':
        conditions.push(`e.direction = 'outbound'`);
        conditions.push(`e.status = 'sent'`);
        break;
      case 'drafts':
        conditions.push(`e.status = 'draft'`);
        break;
      case 'archived':
        conditions.push(`e.status = 'archived'`);
        break;
      case 'trash':
        conditions.push(`e.status = 'trash'`);
        break;
      case 'starred':
        conditions.push(`e.is_starred = TRUE`);
        conditions.push(`e.status NOT IN ('trash')`);
        break;
    }
  } else {
    // Default: exclude trash
    conditions.push(`e.status != 'trash'`);
  }

  if (filters?.status) {
    conditions.push(`e.status = $${paramIdx}`);
    params.push(filters.status);
    paramIdx++;
  }

  if (filters?.direction) {
    conditions.push(`e.direction = $${paramIdx}`);
    params.push(filters.direction);
    paramIdx++;
  }

  if (filters?.category) {
    conditions.push(`e.ai_category = $${paramIdx}`);
    params.push(filters.category);
    paramIdx++;
  }

  if (filters?.account_id) {
    conditions.push(`e.account_id = $${paramIdx}`);
    params.push(filters.account_id);
    paramIdx++;
  }

  if (filters?.is_starred !== undefined) {
    conditions.push(`e.is_starred = $${paramIdx}`);
    params.push(filters.is_starred);
    paramIdx++;
  }

  if (filters?.from) {
    conditions.push(`e.from_address ILIKE $${paramIdx}`);
    params.push(`%${filters.from}%`);
    paramIdx++;
  }

  if (filters?.thread_id) {
    conditions.push(`e.thread_id = $${paramIdx}`);
    params.push(filters.thread_id);
    paramIdx++;
  }

  if (filters?.search) {
    conditions.push(`(e.subject ILIKE $${paramIdx} OR e.body_text ILIKE $${paramIdx + 1} OR e.from_address ILIKE $${paramIdx + 2})`);
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern, searchPattern);
    paramIdx += 3;
  }

  const limit = Math.min(filters?.limit || 50, 200);
  const offset = filters?.offset || 0;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count query
  const countResult = await queryContext(context, `
    SELECT COUNT(*) as total FROM emails e ${whereClause}
  `, params);
  const total = parseInt(countResult.rows[0]?.total, 10) || 0;

  // Main query with account join + thread_count via window function (avoids N+1)
  const result = await queryContext(context, `
    SELECT e.*,
      a.email_address as account_email,
      a.display_name as account_display_name,
      tc.thread_count
    FROM emails e
    LEFT JOIN email_accounts a ON e.account_id = a.id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) as thread_count FROM emails t WHERE t.thread_id = e.thread_id
    ) tc ON TRUE
    ${whereClause}
    ORDER BY e.received_at DESC
    LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
  `, [...params, limit, offset]);

  return {
    emails: result.rows.map(mapRowToEmail),
    total,
  };
}

// ============================================================
// Get Single Email
// ============================================================

export async function getEmail(context: AIContext, id: string): Promise<Email | null> {
  const result = await queryContext(context, `
    SELECT e.*,
      a.email_address as account_email,
      a.display_name as account_display_name,
      (SELECT COUNT(*) FROM emails t WHERE t.thread_id = e.thread_id) as thread_count
    FROM emails e
    LEFT JOIN email_accounts a ON e.account_id = a.id
    WHERE e.id = $1
  `, [id]);

  if (result.rows.length === 0) {return null;}
  return mapRowToEmail(result.rows[0]);
}

// ============================================================
// Get Thread
// ============================================================

export async function getThread(context: AIContext, threadId: string): Promise<Email[]> {
  const result = await queryContext(context, `
    SELECT e.*,
      a.email_address as account_email,
      a.display_name as account_display_name
    FROM emails e
    LEFT JOIN email_accounts a ON e.account_id = a.id
    WHERE e.thread_id = $1
    ORDER BY e.received_at ASC
    LIMIT 200
  `, [threadId]);

  return result.rows.map(mapRowToEmail);
}

// ============================================================
// Create Draft
// ============================================================

export async function createDraft(context: AIContext, input: CreateEmailInput): Promise<Email> {
  const id = uuidv4();
  const now = new Date().toISOString();

  // Get default account for from_address
  let fromAddress = 'noreply@zensation.ai';
  let fromName: string | null = null;

  if (input.account_id) {
    const acct = await queryContext(context, `SELECT email_address, display_name FROM email_accounts WHERE id = $1`, [input.account_id]);
    if (acct.rows[0]) {
      fromAddress = acct.rows[0].email_address;
      fromName = acct.rows[0].display_name;
    }
  } else {
    const defaultAcct = await queryContext(context, `SELECT email_address, display_name FROM email_accounts WHERE is_default = TRUE LIMIT 1`, []);
    if (defaultAcct.rows[0]) {
      fromAddress = defaultAcct.rows[0].email_address;
      fromName = defaultAcct.rows[0].display_name;
    }
  }

  const result = await queryContext(context, `
    INSERT INTO emails (
      id, direction, status, from_address, from_name,
      to_addresses, cc_addresses, bcc_addresses,
      subject, body_html, body_text,
      account_id, reply_to_id, thread_id,
      labels, context, metadata,
      received_at, created_at, updated_at
    ) VALUES (
      $1, 'outbound', 'draft', $2, $3,
      $4, $5, $6,
      $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      $16, $16, $16
    )
    RETURNING *
  `, [
    id, fromAddress, fromName,
    JSON.stringify(input.to_addresses), JSON.stringify(input.cc_addresses || []), JSON.stringify(input.bcc_addresses || []),
    input.subject || null, input.body_html || null, input.body_text || null,
    input.account_id || null, input.reply_to_id || null, input.reply_to_id || id,
    JSON.stringify(input.labels || []), context, JSON.stringify(input.metadata || {}),
    now,
  ]);

  logger.info('Email draft created', { id, context, operation: 'createDraft' });
  return mapRowToEmail(result.rows[0]);
}

// ============================================================
// Update Draft
// ============================================================

export async function updateDraft(
  context: AIContext,
  id: string,
  updates: Partial<CreateEmailInput>
): Promise<Email | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: (string | null)[] = [id];
  let paramIdx = 2;

  if (updates.to_addresses !== undefined) {
    setClauses.push(`to_addresses = $${paramIdx}`);
    params.push(JSON.stringify(updates.to_addresses));
    paramIdx++;
  }
  if (updates.cc_addresses !== undefined) {
    setClauses.push(`cc_addresses = $${paramIdx}`);
    params.push(JSON.stringify(updates.cc_addresses));
    paramIdx++;
  }
  if (updates.bcc_addresses !== undefined) {
    setClauses.push(`bcc_addresses = $${paramIdx}`);
    params.push(JSON.stringify(updates.bcc_addresses));
    paramIdx++;
  }
  if (updates.subject !== undefined) {
    setClauses.push(`subject = $${paramIdx}`);
    params.push(updates.subject || null);
    paramIdx++;
  }
  if (updates.body_html !== undefined) {
    setClauses.push(`body_html = $${paramIdx}`);
    params.push(updates.body_html || null);
    paramIdx++;
  }
  if (updates.body_text !== undefined) {
    setClauses.push(`body_text = $${paramIdx}`);
    params.push(updates.body_text || null);
    paramIdx++;
  }
  if (updates.account_id !== undefined) {
    setClauses.push(`account_id = $${paramIdx}`);
    params.push(updates.account_id || null);
    paramIdx++;
  }

  const result = await queryContext(context, `
    UPDATE emails SET ${setClauses.join(', ')}
    WHERE id = $1 AND status = 'draft'
    RETURNING *
  `, params);

  if (result.rows.length === 0) {return null;}
  return mapRowToEmail(result.rows[0]);
}

// ============================================================
// Send Email (draft or new)
// ============================================================

export async function sendEmailById(context: AIContext, id: string): Promise<Email | null> {
  if (!isResendConfigured()) {
    throw new Error('Resend is not configured — cannot send emails');
  }

  // Atomic status transition: draft → sending (prevents double-send race condition)
  const lockResult = await queryContext(context, `
    UPDATE emails SET status = 'sending', updated_at = NOW()
    WHERE id = $1 AND status = 'draft'
    RETURNING *
  `, [id]);

  if (lockResult.rows.length === 0) {
    const existing = await getEmail(context, id);
    if (!existing) {return null;}
    throw new Error(`Cannot send email with status "${existing.status}"`);
  }

  const email = mapRowToEmail(lockResult.rows[0]);

  try {
    const result = await resendSendEmail({
      from: email.from_name ? `${email.from_name} <${email.from_address}>` : email.from_address,
      to: email.to_addresses.map(a => a.email),
      cc: email.cc_addresses.length > 0 ? email.cc_addresses.map(a => a.email) : undefined,
      bcc: email.bcc_addresses.length > 0 ? email.bcc_addresses.map(a => a.email) : undefined,
      subject: email.subject || '(Kein Betreff)',
      html: email.body_html || undefined,
      text: email.body_text || undefined,
    });

    // Mark as sent - if DB update fails, email was already sent via Resend
    // so we mark it with the Resend ID and log the discrepancy
    try {
      const updated = await queryContext(context, `
        UPDATE emails SET
          status = 'sent',
          resend_email_id = $2,
          sent_at = NOW(),
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id, result.id]);

      logger.info('Email sent', { id, resendId: result.id, context, operation: 'sendEmail' });
      return mapRowToEmail(updated.rows[0]);
    } catch (dbErr) {
      // Resend succeeded but DB update failed - log critical discrepancy
      // DO NOT throw: email was actually sent. Attempt to save the Resend ID at minimum.
      logger.error('Email sent via Resend but DB update failed', dbErr instanceof Error ? dbErr : undefined, {
        id, resendId: result.id, context, operation: 'sendEmail',
      });
      // Attempt minimal status update
      try {
        await queryContext(context, `
          UPDATE emails SET status = 'sent', resend_email_id = $2, updated_at = NOW() WHERE id = $1
        `, [id, result.id]);
      } catch { /* last resort failed, logged above */ }
      // Return the email as-is with sent status
      return { ...email, status: 'sent' as const, resend_email_id: result.id };
    }
  } catch (err) {
    // Resend API failed — mark as failed so user can retry
    try {
      await queryContext(context, `
        UPDATE emails SET status = 'failed', metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
        WHERE id = $1
      `, [id, JSON.stringify({ send_error: (err as Error).message })]);
    } catch (dbErr) {
      logger.error('Failed to update email status to failed', dbErr instanceof Error ? dbErr : undefined, { id, operation: 'sendEmail' });
    }

    throw err;
  }
}

export async function sendNewEmail(context: AIContext, input: CreateEmailInput): Promise<Email> {
  const draft = await createDraft(context, input);
  const sent = await sendEmailById(context, draft.id);
  if (!sent) {throw new Error('Failed to send email — draft was created but send returned null');}
  return sent;
}

// ============================================================
// Reply / Forward
// ============================================================

export async function replyToEmail(
  context: AIContext,
  originalId: string,
  body: { html?: string; text?: string },
  options?: { cc?: Array<{ email: string; name?: string }>; account_id?: string }
): Promise<Email> {
  const original = await getEmail(context, originalId);
  if (!original) {throw new NotFoundError('Original email');}

  const draft = await createDraft(context, {
    to_addresses: [{ email: original.from_address, name: original.from_name || undefined }],
    cc_addresses: options?.cc,
    subject: original.subject?.startsWith('Re: ') ? original.subject : `Re: ${original.subject || ''}`,
    body_html: body.html,
    body_text: body.text,
    account_id: options?.account_id || original.account_id || undefined,
    reply_to_id: originalId,
  });

  // Link to same thread
  await queryContext(context, `
    UPDATE emails SET thread_id = $2, in_reply_to = $3
    WHERE id = $1
  `, [draft.id, original.thread_id || originalId, original.message_id]);

  return await sendEmailById(context, draft.id) || draft;
}

export async function forwardEmail(
  context: AIContext,
  originalId: string,
  to: Array<{ email: string; name?: string }>,
  body?: { html?: string; text?: string },
  options?: { account_id?: string }
): Promise<Email> {
  const original = await getEmail(context, originalId);
  if (!original) {throw new NotFoundError('Original email');}

  // Build forwarded body
  const fwdPrefix = `\n\n---------- Weitergeleitete Nachricht ----------\nVon: ${original.from_name || original.from_address}\nDatum: ${original.received_at}\nBetreff: ${original.subject}\nAn: ${original.to_addresses.map(a => a.email).join(', ')}\n\n`;

  const draft = await createDraft(context, {
    to_addresses: to,
    subject: original.subject?.startsWith('Fwd: ') ? original.subject : `Fwd: ${original.subject || ''}`,
    body_html: (body?.html || '') + fwdPrefix.replace(/\n/g, '<br>') + (original.body_html || ''),
    body_text: (body?.text || '') + fwdPrefix + (original.body_text || ''),
    account_id: options?.account_id || original.account_id || undefined,
  });

  return await sendEmailById(context, draft.id) || draft;
}

// ============================================================
// Status Updates
// ============================================================

export async function updateEmailStatus(context: AIContext, id: string, status: EmailStatus): Promise<Email | null> {
  const result = await queryContext(context, `
    UPDATE emails SET status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, status]);

  if (result.rows.length === 0) {return null;}
  return mapRowToEmail(result.rows[0]);
}

export async function markAsRead(context: AIContext, id: string): Promise<Email | null> {
  const result = await queryContext(context, `
    UPDATE emails SET status = 'read', updated_at = NOW()
    WHERE id = $1 AND status = 'received'
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {return null;}
  return mapRowToEmail(result.rows[0]);
}

export async function toggleStar(context: AIContext, id: string): Promise<Email | null> {
  const result = await queryContext(context, `
    UPDATE emails SET is_starred = NOT is_starred, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id]);

  if (result.rows.length === 0) {return null;}
  return mapRowToEmail(result.rows[0]);
}

export async function batchUpdateStatus(
  context: AIContext,
  ids: string[],
  status: EmailStatus
): Promise<number> {
  const result = await queryContext(context, `
    UPDATE emails SET status = $2, updated_at = NOW()
    WHERE id = ANY($1::uuid[])
  `, [ids, status]);

  return result.rowCount ?? 0;
}

export async function moveToTrash(context: AIContext, id: string): Promise<Email | null> {
  return updateEmailStatus(context, id, 'trash');
}

// ============================================================
// Stats
// ============================================================

export async function getEmailStats(context: AIContext): Promise<EmailStats> {
  // Single query with sub-selects to avoid 3 round-trips
  const result = await queryContext(context, `
    SELECT
      (SELECT COUNT(*) FROM emails WHERE status != 'trash') as total,
      (SELECT COUNT(*) FROM emails WHERE status = 'received') as unread,
      (SELECT COUNT(*) FROM emails WHERE is_starred = TRUE AND status != 'trash') as starred,
      COALESCE((
        SELECT jsonb_object_agg(ai_category, cnt)
        FROM (SELECT ai_category, COUNT(*)::int as cnt FROM emails WHERE ai_category IS NOT NULL AND status NOT IN ('trash', 'draft') GROUP BY ai_category) sub
      ), '{}'::jsonb) as by_category,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('account_id', sub.account_id, 'email', COALESCE(sub.email, 'unknown'), 'count', sub.cnt))
        FROM (SELECT e.account_id, a.email_address as email, COUNT(*)::int as cnt FROM emails e LEFT JOIN email_accounts a ON e.account_id = a.id WHERE e.account_id IS NOT NULL AND e.status NOT IN ('trash', 'draft') GROUP BY e.account_id, a.email_address) sub
      ), '[]'::jsonb) as by_account
  `, []);

  const row = result.rows[0] || {};

  return {
    total: parseInt(row.total, 10) || 0,
    unread: parseInt(row.unread, 10) || 0,
    starred: parseInt(row.starred, 10) || 0,
    by_category: typeof row.by_category === 'string' ? JSON.parse(row.by_category) : (row.by_category || {}),
    by_account: typeof row.by_account === 'string' ? JSON.parse(row.by_account) : (row.by_account || []),
  };
}

// ============================================================
// Account Management
// ============================================================

export async function getAccounts(context: AIContext): Promise<EmailAccount[]> {
  const result = await queryContext(context, `SELECT * FROM email_accounts ORDER BY is_default DESC, created_at ASC LIMIT 100`, []);
  return result.rows as EmailAccount[];
}

export async function getAccount(context: AIContext, id: string): Promise<EmailAccount | null> {
  const result = await queryContext(context, `SELECT * FROM email_accounts WHERE id = $1`, [id]);
  return result.rows[0] as EmailAccount | null;
}

export async function createAccount(
  context: AIContext,
  input: { email_address: string; display_name?: string; domain: string; is_default?: boolean; signature_html?: string; signature_text?: string }
): Promise<EmailAccount> {
  const id = uuidv4();
  const isDefault = !!input.is_default;

  // CTE atomically unsets other defaults when setting this as default
  const sql = isDefault
    ? `WITH unset_defaults AS (
        UPDATE email_accounts SET is_default = FALSE WHERE is_default = TRUE
      )
      INSERT INTO email_accounts (id, email_address, display_name, domain, is_default, signature_html, signature_text, context)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`
    : `INSERT INTO email_accounts (id, email_address, display_name, domain, is_default, signature_html, signature_text, context)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`;

  const result = await queryContext(context, sql, [
    id, input.email_address, input.display_name || null, input.domain,
    isDefault, input.signature_html || null, input.signature_text || null, context,
  ]);

  logger.info('Email account created', { id, email: input.email_address, context, operation: 'createAccount' });
  return result.rows[0] as EmailAccount;
}

export async function updateAccount(
  context: AIContext,
  id: string,
  updates: Partial<{ display_name: string; is_default: boolean; signature_html: string; signature_text: string }>
): Promise<EmailAccount | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: (string | boolean | null)[] = [id];
  let paramIdx = 2;

  if (updates.display_name !== undefined) {
    setClauses.push(`display_name = $${paramIdx}`);
    params.push(updates.display_name);
    paramIdx++;
  }
  if (updates.is_default !== undefined) {
    setClauses.push(`is_default = $${paramIdx}`);
    params.push(updates.is_default);
    paramIdx++;
  }
  if (updates.signature_html !== undefined) {
    setClauses.push(`signature_html = $${paramIdx}`);
    params.push(updates.signature_html);
    paramIdx++;
  }
  if (updates.signature_text !== undefined) {
    setClauses.push(`signature_text = $${paramIdx}`);
    params.push(updates.signature_text);
    paramIdx++;
  }

  // Use CTE to atomically unset other defaults when setting this as default
  const sql = updates.is_default
    ? `WITH unset_defaults AS (
        UPDATE email_accounts SET is_default = FALSE WHERE is_default = TRUE AND id != $1
      )
      UPDATE email_accounts SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`
    : `UPDATE email_accounts SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *`;

  const result = await queryContext(context, sql, params);

  return result.rows[0] as EmailAccount | null;
}

export async function deleteAccount(context: AIContext, id: string): Promise<void> {
  await queryContext(context, `DELETE FROM email_accounts WHERE id = $1`, [id]);
  logger.info('Email account deleted', { id, context, operation: 'deleteAccount' });
}

/**
 * Create an IMAP-enabled email account (Phase 39).
 */
export async function createImapAccount(
  context: AIContext,
  input: {
    email_address: string;
    display_name?: string;
    domain: string;
    imap_host: string;
    imap_port?: number;
    imap_user: string;
    imap_password_encrypted: string;
    imap_tls?: boolean;
    sync_folder?: string;
  }
): Promise<EmailAccount> {
  const id = uuidv4();

  const result = await queryContext(context, `
    INSERT INTO email_accounts (
      id, email_address, display_name, domain, is_default,
      context, imap_host, imap_port, imap_user, imap_password_encrypted,
      imap_tls, imap_enabled, sync_folder
    ) VALUES (
      $1, $2, $3, $4, FALSE,
      $5, $6, $7, $8, $9,
      $10, TRUE, $11
    )
    RETURNING *
  `, [
    id, input.email_address, input.display_name || null, input.domain,
    context, input.imap_host, input.imap_port || 993, input.imap_user,
    input.imap_password_encrypted, input.imap_tls !== false,
    input.sync_folder || 'INBOX',
  ]);

  logger.info('IMAP email account created', { id, email: input.email_address, host: input.imap_host, context, operation: 'createImapAccount' });
  return result.rows[0] as EmailAccount;
}

// ============================================================
// Labels
// ============================================================

export async function getLabels(context: AIContext): Promise<EmailLabel[]> {
  const result = await queryContext(context, `SELECT * FROM email_labels ORDER BY sort_order ASC, name ASC LIMIT 200`, []);
  return result.rows as EmailLabel[];
}

export async function createLabel(
  context: AIContext,
  input: { name: string; color?: string; icon?: string }
): Promise<EmailLabel> {
  const id = uuidv4();
  const result = await queryContext(context, `
    INSERT INTO email_labels (id, name, color, icon, context)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [id, input.name, input.color || '#4A90D9', input.icon || '🏷️', context]);

  return result.rows[0] as EmailLabel;
}

export async function updateLabel(
  context: AIContext,
  id: string,
  updates: Partial<{ name: string; color: string; icon: string; sort_order: number }>
): Promise<EmailLabel | null> {
  const setClauses: string[] = [];
  const params: (string | number)[] = [id];
  let paramIdx = 2;

  if (updates.name !== undefined) { setClauses.push(`name = $${paramIdx}`); params.push(updates.name); paramIdx++; }
  if (updates.color !== undefined) { setClauses.push(`color = $${paramIdx}`); params.push(updates.color); paramIdx++; }
  if (updates.icon !== undefined) { setClauses.push(`icon = $${paramIdx}`); params.push(updates.icon); paramIdx++; }
  if (updates.sort_order !== undefined) { setClauses.push(`sort_order = $${paramIdx}`); params.push(updates.sort_order); paramIdx++; }

  if (setClauses.length === 0) {return null;}

  const result = await queryContext(context, `
    UPDATE email_labels SET ${setClauses.join(', ')} WHERE id = $1 RETURNING *
  `, params);

  return result.rows[0] as EmailLabel | null;
}

export async function deleteLabel(context: AIContext, id: string): Promise<void> {
  await queryContext(context, `DELETE FROM email_labels WHERE id = $1`, [id]);
}
