/**
 * IMAP Email Sync Service - Phase 39
 *
 * Connects to IMAP servers (e.g. iCloud Mail) and syncs emails
 * into the existing emails table. Uses ImapFlow for modern async IMAP.
 *
 * Sync strategy: Incremental via UID + UIDVALIDITY, polled every 5 minutes.
 */

import { ImapFlow, FetchMessageObject } from 'imapflow';
import { v4 as uuidv4 } from 'uuid';
import { queryContext, AIContext } from '../utils/database-context';
import { VALID_CONTEXTS } from '../types';
import { decrypt } from '../utils/encryption';
import { logger } from '../utils/logger';
import { simpleParser, ParsedMail } from 'mailparser';

// ============================================================
// Types
// ============================================================

export interface ImapAccount {
  id: string;
  email_address: string;
  display_name: string | null;
  domain: string;
  context: AIContext;
  imap_host: string;
  imap_port: number;
  imap_user: string;
  imap_password_encrypted: string;
  imap_tls: boolean;
  imap_enabled: boolean;
  last_sync_uid: number;
  last_sync_uidvalidity: number | null;
  last_sync_at: string | null;
  sync_error: string | null;
  sync_folder: string;
}

interface SyncResult {
  newEmails: number;
  errors: number;
  lastUid: number;
}

// ============================================================
// Configuration
// ============================================================

const SYNC_INTERVAL = parseInt(process.env.IMAP_SYNC_INTERVAL || '300000', 10); // 5 minutes
const ENABLED = process.env.ENABLE_IMAP_SYNC !== 'false';
const MAX_INITIAL_FETCH = 50; // Limit first sync to most recent 50 emails

let schedulerInterval: NodeJS.Timeout | null = null;
let isSyncing = false;

// ============================================================
// IMAP Connection
// ============================================================

function createImapClient(account: ImapAccount, password: string): ImapFlow {
  return new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_tls,
    auth: {
      user: account.imap_user,
      pass: password,
    },
    logger: false, // Suppress verbose IMAP logs
    emitLogs: false,
  });
}

/**
 * Test IMAP connection with provided credentials.
 * Returns true on success, throws on failure.
 */
export async function testImapConnection(
  host: string,
  port: number,
  user: string,
  password: string,
  tls: boolean = true,
): Promise<{ success: boolean; mailboxes: string[] }> {
  const client = new ImapFlow({
    host,
    port,
    secure: tls,
    auth: { user, pass: password },
    logger: false,
    emitLogs: false,
  });

  try {
    await client.connect();
    const mailboxes: string[] = [];
    const tree = await client.list();
    for (const mb of tree) {
      mailboxes.push(mb.path);
    }
    await client.logout();
    return { success: true, mailboxes };
  } catch (err) {
    throw new Error(`IMAP connection failed: ${(err as Error).message}`);
  }
}

// ============================================================
// Sync Logic
// ============================================================

/**
 * Sync a single IMAP account: fetch new emails since last UID.
 */
export async function syncAccount(context: AIContext, account: ImapAccount): Promise<SyncResult> {
  let password: string;
  try {
    password = decrypt(account.imap_password_encrypted);
  } catch (err) {
    const error = `Decryption failed: ${(err as Error).message}`;
    await updateSyncError(context, account.id, error);
    throw new Error(error);
  }

  const client = createImapClient(account, password);
  const result: SyncResult = { newEmails: 0, errors: 0, lastUid: account.last_sync_uid };

  try {
    await client.connect();
    const mailbox = await client.mailboxOpen(account.sync_folder || 'INBOX');

    // Check UIDVALIDITY — if changed, mailbox was recreated, need full resync
    // Convert bigint to number for DB storage and comparison
    const uidValidity = Number(mailbox.uidValidity);
    const needsFullResync = account.last_sync_uidvalidity !== null &&
      uidValidity !== account.last_sync_uidvalidity;

    if (needsFullResync) {
      logger.info('UIDVALIDITY changed, performing full resync', {
        account: account.email_address,
        oldValidity: account.last_sync_uidvalidity,
        newValidity: uidValidity,
        operation: 'imapSync',
      });
    }

    // Determine UID range to fetch
    let uidRange: string;
    if (needsFullResync || account.last_sync_uid === 0) {
      // First sync or full resync: fetch recent messages
      // Use UIDNEXT to calculate range for last N messages
      const uidNext = mailbox.uidNext || 1;
      const startUid = Math.max(1, uidNext - MAX_INITIAL_FETCH);
      uidRange = `${startUid}:*`;
    } else {
      // Incremental: fetch only new messages
      uidRange = `${account.last_sync_uid + 1}:*`;
    }

    // Fetch messages
    let maxUid = account.last_sync_uid;

    for await (const msg of client.fetch(uidRange, {
      uid: true,
      envelope: true,
      source: true,
      flags: true,
      bodyStructure: true,
    })) {
      // Skip if UID is not actually newer (can happen with range queries)
      if (msg.uid <= account.last_sync_uid && !needsFullResync) continue;

      try {
        // Check if we already have this message (by message-id)
        const messageId = msg.envelope?.messageId || null;
        if (messageId) {
          const existing = await queryContext(context,
            'SELECT id FROM emails WHERE message_id = $1 LIMIT 1',
            [messageId],
          );
          if (existing.rows.length > 0) {
            if (msg.uid > maxUid) maxUid = msg.uid;
            continue; // Already synced (maybe via Resend)
          }
        }

        await insertImapEmail(context, account.id, msg, account.email_address);
        result.newEmails++;
      } catch (err) {
        result.errors++;
        logger.warn('Failed to insert IMAP email', {
          uid: msg.uid,
          subject: msg.envelope?.subject,
          error: (err as Error).message,
          operation: 'imapSync',
        });
      }

      if (msg.uid > maxUid) maxUid = msg.uid;
    }

    result.lastUid = maxUid;

    // Update sync state
    await queryContext(context, `
      UPDATE email_accounts SET
        last_sync_uid = $1,
        last_sync_uidvalidity = $2,
        last_sync_at = NOW(),
        sync_error = NULL
      WHERE id = $3
    `, [result.lastUid, uidValidity, account.id]);

    await client.logout();

    logger.info('IMAP sync complete', {
      account: account.email_address,
      context,
      newEmails: result.newEmails,
      errors: result.errors,
      lastUid: result.lastUid,
      operation: 'imapSync',
    });

    return result;
  } catch (err) {
    const error = (err as Error).message;
    await updateSyncError(context, account.id, error);

    try { await client.logout(); } catch { /* ignore */ }

    logger.error('IMAP sync failed', err instanceof Error ? err : undefined, {
      account: account.email_address,
      context,
      operation: 'imapSync',
    });
    throw err;
  }
}

// ============================================================
// Email Insertion
// ============================================================

/**
 * Parse an IMAP message and insert it into the emails table.
 */
async function insertImapEmail(
  context: AIContext,
  accountId: string,
  msg: FetchMessageObject,
  accountEmail: string,
): Promise<string> {
  const id = uuidv4();
  const envelope = msg.envelope;

  // Parse full message source for body extraction
  let bodyHtml: string | null = null;
  let bodyText: string | null = null;
  let attachments: Array<{ filename: string; content_type: string; size?: number }> = [];

  if (msg.source) {
    try {
      const parsed: ParsedMail = await simpleParser(msg.source);
      bodyHtml = parsed.html || null;
      bodyText = parsed.text || null;

      if (parsed.attachments && parsed.attachments.length > 0) {
        attachments = parsed.attachments.map(a => ({
          filename: a.filename || 'attachment',
          content_type: a.contentType || 'application/octet-stream',
          size: a.size,
        }));
      }
    } catch (err) {
      logger.warn('Failed to parse IMAP message body', {
        uid: msg.uid,
        error: (err as Error).message,
        operation: 'insertImapEmail',
      });
    }
  }

  // Extract addresses from envelope
  const fromAddress = envelope?.from?.[0]?.address || 'unknown@unknown';
  const fromName = envelope?.from?.[0]?.name || null;

  const toAddresses = (envelope?.to || []).map(a => ({
    email: a.address || '',
    name: a.name || null,
  }));

  const ccAddresses = (envelope?.cc || []).map(a => ({
    email: a.address || '',
    name: a.name || null,
  }));

  const bccAddresses = (envelope?.bcc || []).map(a => ({
    email: a.address || '',
    name: a.name || null,
  }));

  const subject = envelope?.subject || '(Kein Betreff)';
  const messageId = envelope?.messageId || null;
  const inReplyTo = envelope?.inReplyTo || null;
  const date = envelope?.date || new Date();
  const hasAttachments = attachments.length > 0;

  // Determine direction: if any "to" address matches our account, it's inbound
  const isInbound = toAddresses.some(a => a.email === accountEmail) ||
    ccAddresses.some(a => a.email === accountEmail);
  const direction = isInbound ? 'inbound' : 'outbound';
  const status = direction === 'inbound' ? 'received' : 'sent';

  // Thread detection
  let threadId: string | null = null;
  if (inReplyTo) {
    const threadResult = await queryContext(context,
      'SELECT thread_id FROM emails WHERE message_id = $1 LIMIT 1',
      [inReplyTo],
    );
    threadId = threadResult.rows[0]?.thread_id || null;
  }
  if (!threadId && messageId) {
    // Check if any email references this message_id as in_reply_to
    const refResult = await queryContext(context,
      'SELECT thread_id FROM emails WHERE in_reply_to = $1 LIMIT 1',
      [messageId],
    );
    threadId = refResult.rows[0]?.thread_id || null;
  }
  if (!threadId) {
    threadId = id;
  }

  // Insert
  await queryContext(context, `
    INSERT INTO emails (
      id, resend_email_id, account_id, direction, status,
      from_address, from_name, to_addresses, cc_addresses, bcc_addresses,
      subject, body_html, body_text,
      thread_id, message_id, in_reply_to, has_attachments, attachments,
      context, received_at, created_at, updated_at
    ) VALUES (
      $1, NULL, $2, $3, $4,
      $5, $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15, $16, $17,
      $18, $19, NOW(), NOW()
    )
  `, [
    id, accountId, direction, status,
    fromAddress, fromName,
    JSON.stringify(toAddresses), JSON.stringify(ccAddresses), JSON.stringify(bccAddresses),
    subject, bodyHtml, bodyText,
    threadId, messageId, inReplyTo,
    hasAttachments, JSON.stringify(attachments),
    context, date instanceof Date ? date.toISOString() : date,
  ]);

  // Queue AI processing (fire-and-forget, only for inbound)
  if (direction === 'inbound') {
    processEmailWithAIAsync(context, id);
  }

  return id;
}

async function processEmailWithAIAsync(context: AIContext, emailId: string): Promise<void> {
  try {
    const { processEmailWithAI } = await import('./email-ai');
    await processEmailWithAI(context, emailId);
  } catch (err) {
    logger.warn('AI email processing not available for IMAP email', {
      emailId,
      error: (err as Error).message,
      operation: 'imapSyncAI',
    });
  }
}

// ============================================================
// Account Queries
// ============================================================

/**
 * Get all IMAP-enabled accounts across all contexts.
 */
export async function getImapAccounts(): Promise<Array<ImapAccount & { context: AIContext }>> {
  const accounts: Array<ImapAccount & { context: AIContext }> = [];

  for (const ctx of VALID_CONTEXTS) {
    try {
      const result = await queryContext(ctx as AIContext, `
        SELECT * FROM email_accounts
        WHERE imap_enabled = TRUE AND imap_host IS NOT NULL
      `);
      for (const row of result.rows) {
        accounts.push({ ...row, context: ctx as AIContext });
      }
    } catch {
      // Schema may not have the columns yet (pre-migration)
    }
  }

  return accounts;
}

async function updateSyncError(context: AIContext, accountId: string, error: string): Promise<void> {
  try {
    await queryContext(context, `
      UPDATE email_accounts SET sync_error = $1, last_sync_at = NOW()
      WHERE id = $2
    `, [error.substring(0, 500), accountId]);
  } catch {
    // Ignore — best effort
  }
}

// ============================================================
// Scheduler
// ============================================================

/**
 * Sync all enabled IMAP accounts.
 */
export async function syncAllAccounts(): Promise<{ synced: number; failed: number }> {
  if (isSyncing) {
    logger.debug('IMAP sync already in progress, skipping', { operation: 'imapScheduler' });
    return { synced: 0, failed: 0 };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const accounts = await getImapAccounts();

    if (accounts.length === 0) return { synced: 0, failed: 0 };

    logger.debug(`IMAP sync starting for ${accounts.length} account(s)`, { operation: 'imapScheduler' });

    for (const account of accounts) {
      try {
        await syncAccount(account.context, account);
        synced++;
      } catch {
        failed++;
      }
    }

    return { synced, failed };
  } finally {
    isSyncing = false;
  }
}

/**
 * Start the IMAP sync scheduler (periodic polling).
 */
export function startImapScheduler(): void {
  if (!ENABLED) {
    logger.info('IMAP sync disabled (ENABLE_IMAP_SYNC=false)', { operation: 'imapScheduler' });
    return;
  }

  if (schedulerInterval) {
    logger.warn('IMAP scheduler already running', { operation: 'imapScheduler' });
    return;
  }

  logger.info(`IMAP sync scheduler started (interval: ${SYNC_INTERVAL / 1000}s)`, { operation: 'imapScheduler' });

  // Run initial sync after 30s delay (let server start up)
  setTimeout(() => {
    syncAllAccounts().catch(err => {
      logger.error('Initial IMAP sync failed', err instanceof Error ? err : undefined, { operation: 'imapScheduler' });
    });
  }, 30000);

  schedulerInterval = setInterval(() => {
    syncAllAccounts().catch(err => {
      logger.error('Scheduled IMAP sync failed', err instanceof Error ? err : undefined, { operation: 'imapScheduler' });
    });
  }, SYNC_INTERVAL);
}

/**
 * Stop the IMAP sync scheduler.
 */
export function stopImapScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('IMAP sync scheduler stopped', { operation: 'imapScheduler' });
  }
}
