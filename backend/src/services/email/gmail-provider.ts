/**
 * Phase 3A: Gmail Provider
 *
 * Full Gmail API integration using googleapis.
 * Supports full sync, incremental sync via history, body fetch, and message modification.
 */

import { google, gmail_v1 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { queryContext, type AIContext } from '../../utils/database-context';
import { pool } from '../../utils/database';
import { getGoogleToken, updateGoogleTokens, isTokenExpired } from '../auth/google-oauth-tokens';
import { logger } from '../../utils/logger';
import { buildMimeMessage } from './mime-builder';
import type {
  EmailProvider,
  EmailProviderType,
  SyncResult,
  SyncError,
  EmailDraft,
  SendResult,
  MessageMods,
} from './email-provider';

// ===========================================
// Constants
// ===========================================

const CONTEXTS: AIContext[] = ['personal', 'work', 'learning', 'creative'];

const GMAIL_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GMAIL_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';

// Maps Gmail labelIds to DB fields / internal labels
function labelsToDbFields(labelIds: string[]): {
  folder: string;
  isRead: boolean;
  isStarred: boolean;
} {
  const folder = labelIds.includes('SENT')
    ? 'sent'
    : labelIds.includes('DRAFT')
    ? 'drafts'
    : labelIds.includes('SPAM')
    ? 'spam'
    : labelIds.includes('TRASH')
    ? 'trash'
    : 'inbox';

  return {
    folder,
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
  };
}

// ===========================================
// Header helpers
// ===========================================

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[], name: string): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseEmailAddress(raw: string): { email: string; name?: string } {
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2].trim() };
  }
  return { email: raw.trim() };
}

function parseEmailList(raw: string): Array<{ email: string; name?: string }> {
  if (!raw) return [];
  return raw.split(',').map((s) => parseEmailAddress(s.trim())).filter((a) => a.email);
}

// ===========================================
// MIME body extraction
// ===========================================

function extractBodyParts(
  payload: gmail_v1.Schema$MessagePart | undefined
): { bodyText: string | null; bodyHtml: string | null } {
  if (!payload) return { bodyText: null, bodyHtml: null };

  let bodyText: string | null = null;
  let bodyHtml: string | null = null;

  function decode(data: string | null | undefined): string | null {
    if (!data) return null;
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  function walk(part: gmail_v1.Schema$MessagePart): void {
    const mime = part.mimeType ?? '';

    if (mime === 'text/plain' && part.body?.data && bodyText === null) {
      bodyText = decode(part.body.data);
    } else if (mime === 'text/html' && part.body?.data && bodyHtml === null) {
      bodyHtml = decode(part.body.data);
    }

    if (part.parts) {
      for (const child of part.parts) {
        walk(child);
      }
    }
  }

  walk(payload);
  return { bodyText, bodyHtml };
}

// ===========================================
// GmailProvider
// ===========================================

export class GmailProvider implements EmailProvider {
  readonly type: EmailProviderType = 'gmail';

  // -------------------------------------------
  // Internal: build authenticated Gmail client
  // -------------------------------------------

  private async getGmailClient(
    accountId: string,
    context: AIContext
  ): Promise<{ gmail: gmail_v1.Gmail; account: Record<string, unknown> }> {
    // Load account row
    const accountResult = await queryContext(
      context,
      'SELECT id, google_token_id, gmail_history_id, provider, user_id, email_address FROM email_accounts WHERE id = $1 AND provider = $2',
      [accountId, 'gmail']
    );

    if (accountResult.rows.length === 0) {
      throw new Error(`Gmail account not found: ${accountId}`);
    }

    const account = accountResult.rows[0] as Record<string, unknown>;
    const tokenId = account.google_token_id as string;

    if (!tokenId) {
      throw new Error(`No Google token linked to account: ${accountId}`);
    }

    const token = await getGoogleToken(tokenId);
    if (!token) {
      throw new Error(`Google OAuth token not found: ${tokenId}`);
    }

    const oauth2Client = new OAuth2Client(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
    oauth2Client.setCredentials({
      access_token: token.access_token,
      refresh_token: token.refresh_token,
    });

    // Refresh if expired
    if (isTokenExpired(new Date(token.expires_at))) {
      logger.info('Refreshing expired Google token', { tokenId });
      const refreshed = await oauth2Client.refreshAccessToken();
      const creds = refreshed.credentials;
      await updateGoogleTokens(tokenId, {
        accessToken: creds.access_token!,
        refreshToken: creds.refresh_token ?? undefined,
        expiresAt: new Date(creds.expiry_date!),
      });
      oauth2Client.setCredentials(creds);
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    return { gmail, account };
  }

  // -------------------------------------------
  // Internal: find which context owns accountId
  // (used when context is unknown, e.g. modifyMessage)
  // -------------------------------------------

  private async findAccountContext(accountId: string): Promise<AIContext | null> {
    const unionSql = CONTEXTS.map(
      (ctx) => `SELECT '${ctx}' AS ctx FROM ${ctx}.email_accounts WHERE id = $1`
    ).join(' UNION ALL ');

    const result = await pool.query(unionSql, [accountId]);
    if (result.rows.length === 0) return null;
    return result.rows[0].ctx as AIContext;
  }

  // -------------------------------------------
  // Internal: store a message in DB
  // -------------------------------------------

  private async storeMessage(
    context: AIContext,
    accountId: string,
    msg: gmail_v1.Schema$Message
  ): Promise<{ isNew: boolean }> {
    const gmailMsgId = msg.id!;
    const labelIds: string[] = msg.labelIds ?? [];
    const { folder, isRead, isStarred } = labelsToDbFields(labelIds);

    const headers: gmail_v1.Schema$MessagePartHeader[] = msg.payload?.headers ?? [];
    const fromRaw = getHeader(headers, 'from');
    const toRaw = getHeader(headers, 'to');
    const ccRaw = getHeader(headers, 'cc');
    const subject = getHeader(headers, 'subject');
    const dateRaw = getHeader(headers, 'date');
    const messageIdHeader = getHeader(headers, 'message-id');
    const inReplyTo = getHeader(headers, 'in-reply-to');

    const from = parseEmailAddress(fromRaw);
    const to = parseEmailList(toRaw);
    const cc = parseEmailList(ccRaw);

    const receivedAt = dateRaw
      ? new Date(dateRaw)
      : msg.internalDate
      ? new Date(parseInt(msg.internalDate, 10))
      : new Date();

    const snippet = msg.snippet ?? null;
    const threadId = msg.threadId ?? null;

    // Check if already exists
    const existing = await queryContext(
      context,
      'SELECT id FROM emails WHERE account_id = $1 AND provider_message_id = $2',
      [accountId, gmailMsgId]
    );

    if (existing.rows.length > 0) {
      // Update labels/flags only
      await queryContext(
        context,
        `UPDATE emails SET
           folder = $1, is_read = $2, is_starred = $3,
           labels = $4, updated_at = now()
         WHERE account_id = $5 AND provider_message_id = $6`,
        [folder, isRead, isStarred, JSON.stringify(labelIds), accountId, gmailMsgId]
      );
      return { isNew: false };
    }

    // Insert new
    await queryContext(
      context,
      `INSERT INTO emails (
         account_id, provider_message_id, thread_id, folder,
         from_email, from_name, to_recipients, cc_recipients,
         subject, snippet, is_read, is_starred, has_attachments,
         labels, message_id_header, in_reply_to, received_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        accountId,
        gmailMsgId,
        threadId,
        folder,
        from.email,
        from.name ?? null,
        JSON.stringify(to),
        JSON.stringify(cc),
        subject,
        snippet,
        isRead,
        isStarred,
        false, // has_attachments — detect in body fetch
        JSON.stringify(labelIds),
        messageIdHeader || null,
        inReplyTo || null,
        receivedAt,
      ]
    );

    return { isNew: true };
  }

  // -------------------------------------------
  // syncFull
  // -------------------------------------------

  async syncFull(accountId: string, context: AIContext): Promise<SyncResult> {
    const { gmail } = await this.getGmailClient(accountId, context);

    let newMessages = 0;
    let updatedMessages = 0;
    const errors: SyncError[] = [];
    let pageToken: string | undefined;
    let lastHistoryId: string | null = null;

    do {
      const listResp = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 100,
        pageToken,
      });

      const messages = listResp.data.messages ?? [];

      for (const stub of messages) {
        try {
          const msgResp = await gmail.users.messages.get({
            userId: 'me',
            id: stub.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
          });

          const msg = msgResp.data;
          if (msg.historyId && !lastHistoryId) {
            lastHistoryId = msg.historyId;
          }

          const { isNew } = await this.storeMessage(context, accountId, msg);
          if (isNew) {
            newMessages++;
          } else {
            updatedMessages++;
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push({ messageId: stub.id ?? undefined, error: errMsg, recoverable: true });
          logger.warn('Failed to process Gmail message', { accountId, msgId: stub.id, error: errMsg });
        }
      }

      pageToken = listResp.data.nextPageToken ?? undefined;
    } while (pageToken);

    // Always update last_sync_at (and historyId when available)
    await queryContext(
      context,
      `UPDATE email_accounts
         SET gmail_history_id = COALESCE($1, gmail_history_id), last_sync_at = now()
       WHERE id = $2`,
      [lastHistoryId, accountId]
    );

    return { newMessages, updatedMessages, deletedMessages: 0, newCursor: lastHistoryId, errors };
  }

  // -------------------------------------------
  // syncIncremental
  // -------------------------------------------

  async syncIncremental(accountId: string, context: AIContext): Promise<SyncResult> {
    const { gmail, account } = await this.getGmailClient(accountId, context);
    const startHistoryId = account.gmail_history_id as string | null;

    if (!startHistoryId) {
      // No history ID — fall back to full sync
      return this.syncFull(accountId, context);
    }

    let newMessages = 0;
    let updatedMessages = 0;
    let deletedMessages = 0;
    const errors: SyncError[] = [];

    try {
      const histResp = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
      });

      const historyItems = histResp.data.history ?? [];
      const newHistoryId = histResp.data.historyId ?? startHistoryId;

      for (const item of historyItems) {
        // Messages added
        for (const added of item.messagesAdded ?? []) {
          const msgStub = added.message;
          if (!msgStub?.id) continue;

          try {
            const msgResp = await gmail.users.messages.get({
              userId: 'me',
              id: msgStub.id,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
            });

            const { isNew } = await this.storeMessage(context, accountId, msgResp.data);
            if (isNew) newMessages++;
            else updatedMessages++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({ messageId: msgStub.id, error: errMsg, recoverable: true });
          }
        }

        // Messages deleted
        for (const deleted of item.messagesDeleted ?? []) {
          const msgId = deleted.message?.id;
          if (!msgId) continue;
          try {
            await queryContext(
              context,
              'UPDATE emails SET folder = $1, updated_at = now() WHERE account_id = $2 AND provider_message_id = $3',
              ['trash', accountId, msgId]
            );
            deletedMessages++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({ messageId: msgId, error: errMsg, recoverable: true });
          }
        }

        // Label changes — treat as updates
        for (const labelItem of [...(item.labelsAdded ?? []), ...(item.labelsRemoved ?? [])]) {
          const msgStub = labelItem.message;
          if (!msgStub?.id) continue;
          try {
            const msgResp = await gmail.users.messages.get({
              userId: 'me',
              id: msgStub.id,
              format: 'metadata',
              metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date', 'Message-ID', 'In-Reply-To'],
            });
            const { isNew } = await this.storeMessage(context, accountId, msgResp.data);
            if (isNew) newMessages++;
            else updatedMessages++;
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push({ messageId: msgStub.id, error: errMsg, recoverable: true });
          }
        }
      }

      // Update historyId
      await queryContext(
        context,
        `UPDATE email_accounts SET gmail_history_id = $1, last_sync_at = now() WHERE id = $2`,
        [newHistoryId, accountId]
      );

      return { newMessages, updatedMessages, deletedMessages, newCursor: newHistoryId, errors };
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;

      if (status === 404) {
        // historyId is stale — reset and do full sync
        logger.warn('Gmail historyId invalid, resetting and doing full sync', { accountId });
        await queryContext(
          context,
          'UPDATE email_accounts SET gmail_history_id = NULL WHERE id = $1',
          [accountId]
        );
        return this.syncFull(accountId, context);
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      errors.push({ error: errMsg, recoverable: false });
      return { newMessages, updatedMessages, deletedMessages, newCursor: startHistoryId, errors };
    }
  }

  // -------------------------------------------
  // fetchMessageBody
  // -------------------------------------------

  async fetchMessageBody(
    accountId: string,
    providerMessageId: string
  ): Promise<{ bodyHtml: string | null; bodyText: string | null }> {
    const context = await this.findAccountContext(accountId);
    if (!context) {
      throw new Error(`Cannot find context for account: ${accountId}`);
    }

    const { gmail } = await this.getGmailClient(accountId, context);

    const resp = await gmail.users.messages.get({
      userId: 'me',
      id: providerMessageId,
      format: 'full',
    });

    const { bodyText, bodyHtml } = extractBodyParts(resp.data.payload ?? undefined);
    return { bodyHtml, bodyText };
  }

  // -------------------------------------------
  // sendMessage
  // -------------------------------------------

  async sendMessage(accountId: string, draft: EmailDraft, context?: AIContext): Promise<SendResult> {
    // Resolve context if not provided
    let ctx = context;
    if (!ctx) {
      const ctxResult = await pool.query(
        `SELECT 'personal' as ctx FROM personal.email_accounts WHERE id = $1
         UNION ALL SELECT 'work' FROM work.email_accounts WHERE id = $1
         UNION ALL SELECT 'learning' FROM learning.email_accounts WHERE id = $1
         UNION ALL SELECT 'creative' FROM creative.email_accounts WHERE id = $1
         LIMIT 1`,
        [accountId]
      );
      ctx = (ctxResult.rows[0]?.ctx || 'personal') as AIContext;
    }

    const { gmail, account } = await this.getGmailClient(accountId, ctx);
    const fromAddress = (account.email_address as string) || process.env.RESEND_DEFAULT_FROM || 'noreply@example.com';

    // Build MIME message
    const rawMessage = await buildMimeMessage({
      from: fromAddress,
      to: draft.to.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
      cc: draft.cc?.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
      bcc: draft.bcc?.map(r => r.name ? `${r.name} <${r.email}>` : r.email),
      subject: draft.subject,
      text: draft.bodyText,
      html: draft.bodyHtml,
      inReplyTo: draft.inReplyTo,
      references: draft.inReplyTo, // Phase 3B: single reference
      attachments: draft.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });

    // Validate size (Gmail 25MB limit)
    const MAX_GMAIL_MESSAGE_SIZE = 25 * 1024 * 1024;
    if (rawMessage.length > MAX_GMAIL_MESSAGE_SIZE) {
      throw new Error(`Message size (${Math.round(rawMessage.length / 1024 / 1024)}MB) exceeds Gmail's 25MB limit`);
    }

    // Base64url encode
    const encodedMessage = rawMessage
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send via Gmail API
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: draft.threadId || undefined,
      },
    });

    const messageId = response.data.id || '';
    const threadId = response.data.threadId || undefined;

    logger.info('Gmail message sent', {
      operation: 'gmailSend',
      accountId,
      messageId,
      threadId,
      to: draft.to.map(r => r.email),
    });

    return { messageId, threadId };
  }

  // -------------------------------------------
  // modifyMessage
  // -------------------------------------------

  async modifyMessage(
    accountId: string,
    providerMessageId: string,
    mods: MessageMods
  ): Promise<void> {
    const context = await this.findAccountContext(accountId);
    if (!context) {
      throw new Error(`Cannot find context for account: ${accountId}`);
    }

    const { gmail } = await this.getGmailClient(accountId, context);

    const addLabelIds: string[] = [...(mods.addLabelIds ?? [])];
    const removeLabelIds: string[] = [...(mods.removeLabelIds ?? [])];

    if (mods.read === true) {
      removeLabelIds.push('UNREAD');
    } else if (mods.read === false) {
      addLabelIds.push('UNREAD');
    }

    if (mods.starred === true) {
      addLabelIds.push('STARRED');
    } else if (mods.starred === false) {
      removeLabelIds.push('STARRED');
    }

    await gmail.users.messages.modify({
      userId: 'me',
      id: providerMessageId,
      requestBody: { addLabelIds, removeLabelIds },
    });
  }
}
