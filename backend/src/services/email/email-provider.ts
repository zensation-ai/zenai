/**
 * Phase 3A: Email Provider Abstraction
 *
 * Common interface for Gmail, IMAP, and Resend email providers.
 * Factory returns the correct provider based on account type.
 */

import type { AIContext } from '../../utils/database-context';

// ===========================================
// Types
// ===========================================

export type EmailProviderType = 'gmail' | 'imap' | 'resend';

export interface FetchOptions {
  maxResults?: number;
  pageToken?: string;
  query?: string;
  labelIds?: string[];
}

export interface SyncResult {
  newMessages: number;
  updatedMessages: number;
  deletedMessages: number;
  newCursor: string | null;
  errors: SyncError[];
}

export interface SyncError {
  messageId?: string;
  error: string;
  recoverable: boolean;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface EmailDraft {
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  bcc?: Array<{ email: string; name?: string }>;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  inReplyTo?: string;
  threadId?: string;
  attachments?: EmailAttachment[];
}

export interface SendResult {
  messageId: string;
  threadId?: string;
}

export interface MessageMods {
  addLabelIds?: string[];
  removeLabelIds?: string[];
  starred?: boolean;
  read?: boolean;
}

export interface ProviderMessage {
  providerMessageId: string;
  threadId?: string;
  from: { email: string; name?: string };
  to: Array<{ email: string; name?: string }>;
  cc?: Array<{ email: string; name?: string }>;
  subject: string;
  snippet?: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  date: Date;
  labels: string[];
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
  messageIdHeader?: string;
  inReplyTo?: string;
}

// ===========================================
// Interface
// ===========================================

export interface EmailProvider {
  readonly type: EmailProviderType;

  syncFull(accountId: string, context: AIContext): Promise<SyncResult>;
  syncIncremental(accountId: string, context: AIContext): Promise<SyncResult>;
  fetchMessageBody(accountId: string, providerMessageId: string): Promise<{ bodyHtml: string | null; bodyText: string | null }>;
  sendMessage(accountId: string, draft: EmailDraft, context?: AIContext): Promise<SendResult>;
  modifyMessage(accountId: string, providerMessageId: string, mods: MessageMods): Promise<void>;
}

// ===========================================
// Provider Registry (lazy-loaded singletons)
// ===========================================

const providerInstances: Map<EmailProviderType, EmailProvider> = new Map();

export function getEmailProvider(type: EmailProviderType): EmailProvider {
  let instance = providerInstances.get(type);
  if (instance) {
    return instance;
  }

  switch (type) {
    case 'gmail': {
      const { GmailProvider } = require('./gmail-provider');
      instance = new GmailProvider();
      break;
    }
    case 'imap': {
      const { ImapProvider } = require('./imap-provider');
      instance = new ImapProvider();
      break;
    }
    case 'resend': {
      const { ResendProvider } = require('./resend-provider');
      instance = new ResendProvider();
      break;
    }
    default:
      throw new Error(`Unknown email provider: ${type}`);
  }

  providerInstances.set(type, instance!);
  return instance!;
}
