/**
 * Email Types - Phase 38
 */

export type EmailTab = 'inbox' | 'sent' | 'drafts' | 'archived';
export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'received' | 'read' | 'draft' | 'sending' | 'sent' | 'failed' | 'archived' | 'trash';
export type EmailCategory = 'business' | 'personal' | 'newsletter' | 'notification' | 'spam';
export type EmailPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface EmailAddress {
  email: string;
  name?: string | null;
}

export interface EmailAttachment {
  id?: string;
  filename: string;
  content_type: string;
  size?: number;
}

export interface Email {
  id: string;
  resend_email_id: string | null;
  account_id: string | null;
  direction: EmailDirection;
  status: EmailStatus;
  from_address: string;
  from_name: string | null;
  to_addresses: EmailAddress[];
  cc_addresses: EmailAddress[];
  bcc_addresses: EmailAddress[];
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  reply_to_id: string | null;
  thread_id: string | null;
  has_attachments: boolean;
  attachments: EmailAttachment[];
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
  received_at: string;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  account_email?: string;
  account_display_name?: string;
  thread_count?: number;
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
  created_at: string;
  // IMAP fields (Phase 39)
  imap_host: string | null;
  imap_port: number | null;
  imap_user: string | null;
  imap_tls: boolean | null;
  imap_enabled: boolean;
  last_sync_at: string | null;
  sync_error: string | null;
  sync_folder: string | null;
}

export interface ImapTestResult {
  success: boolean;
  mailboxes: string[];
}

export interface ImapSyncResult {
  newEmails: number;
  errors: number;
  lastUid: number;
}

export interface EmailStats {
  total: number;
  unread: number;
  starred: number;
  by_category: Record<string, number>;
  by_account: Array<{ account_id: string; email: string; count: number }>;
}

export interface ReplySuggestion {
  tone: string;
  subject?: string;
  body: string;
}

export interface EmailFilters {
  folder?: EmailTab | 'starred' | 'trash';
  search?: string;
  category?: string;
  account_id?: string;
}

export const CATEGORY_LABELS: Record<EmailCategory, { label: string; color: string }> = {
  business: { label: 'Geschaeftlich', color: '#4A90D9' },
  personal: { label: 'Persoenlich', color: '#7B68EE' },
  newsletter: { label: 'Newsletter', color: '#20B2AA' },
  notification: { label: 'Benachrichtigung', color: '#FFB347' },
  spam: { label: 'Spam', color: '#FF6B6B' },
};

export const PRIORITY_LABELS: Record<EmailPriority, { label: string; color: string }> = {
  low: { label: 'Niedrig', color: '#90EE90' },
  medium: { label: 'Mittel', color: '#FFD700' },
  high: { label: 'Hoch', color: '#FF8C00' },
  urgent: { label: 'Dringend', color: '#FF4500' },
};
