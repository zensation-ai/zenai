/**
 * Email Types - Premium Email Client
 */

export type EmailTab = 'inbox' | 'sent' | 'drafts' | 'archived' | 'trash' | 'starred';
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
  message_id?: string | null;
  in_reply_to?: string | null;
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
  folder?: EmailTab | string;
  search?: string;
  category?: string;
  priority?: string;
  account_id?: string;
  unread?: boolean;
}

export interface UndoAction {
  id: string;
  type: 'archive' | 'delete' | 'status';
  emailId: string;
  previousStatus: EmailStatus;
  label: string;
  timestamp: number;
}

export type ComposeMode = 'new' | 'reply' | 'reply-all' | 'forward';

export interface ComposeState {
  mode: ComposeMode;
  replyTo?: Email;
  prefillBody?: string;
  prefillSubject?: string;
}

export const CATEGORY_LABELS: Record<EmailCategory, { label: string; color: string; icon: string }> = {
  business: { label: 'Geschaeftlich', color: '#4A90D9', icon: '💼' },
  personal: { label: 'Persoenlich', color: '#7B68EE', icon: '👤' },
  newsletter: { label: 'Newsletter', color: '#20B2AA', icon: '📰' },
  notification: { label: 'Benachrichtigung', color: '#FFB347', icon: '🔔' },
  spam: { label: 'Spam', color: '#FF6B6B', icon: '🚫' },
};

export const PRIORITY_LABELS: Record<EmailPriority, { label: string; color: string; icon: string }> = {
  low: { label: 'Niedrig', color: '#90EE90', icon: '▽' },
  medium: { label: 'Mittel', color: '#FFD700', icon: '◆' },
  high: { label: 'Hoch', color: '#FF8C00', icon: '△' },
  urgent: { label: 'Dringend', color: '#FF4500', icon: '‼' },
};

export const FOLDER_CONFIG: Record<EmailTab, { label: string; icon: string }> = {
  inbox: { label: 'Posteingang', icon: '📥' },
  sent: { label: 'Gesendet', icon: '📤' },
  drafts: { label: 'Entwuerfe', icon: '📝' },
  archived: { label: 'Archiv', icon: '📦' },
  trash: { label: 'Papierkorb', icon: '🗑' },
  starred: { label: 'Markiert', icon: '⭐' },
};

export function stringToColor(str: string): string {
  const colors = [
    '#4A90D9', '#7B68EE', '#20B2AA', '#FF6B6B', '#FFB347',
    '#FF8C00', '#9B59B6', '#3498DB', '#E74C3C', '#2ECC71',
    '#F39C12', '#1ABC9C', '#E91E63', '#00BCD4', '#FF5722',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

export function formatEmailDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (diffMin < 1) return 'Jetzt';
  if (diffMin < 60) return `${diffMin} Min.`;
  if (isToday) return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  if (isYesterday) return 'Gestern';
  if (diffHours < 168) return date.toLocaleDateString('de-DE', { weekday: 'short' });
  if (isThisYear) return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: '2-digit' });
}

export function formatEmailDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function truncateText(text: string | null, maxLen: number): string {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
}
