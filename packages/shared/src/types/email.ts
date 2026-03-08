/**
 * Email types shared across frontend and backend
 */

export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'received' | 'read' | 'draft' | 'sending' | 'sent' | 'failed' | 'archived' | 'trash';
export type EmailCategory = 'business' | 'personal' | 'newsletter' | 'notification' | 'spam';
export type EmailPriority = 'low' | 'medium' | 'high' | 'urgent';
export type EmailSentiment = 'positive' | 'neutral' | 'negative' | 'mixed';

export interface Email {
  id: string;
  account_id?: string;
  direction: EmailDirection;
  status: EmailStatus;
  from_address: string;
  from_name?: string;
  to_addresses: string[];
  cc_addresses?: string[];
  subject: string;
  body_text?: string;
  body_html?: string;
  thread_id?: string;
  in_reply_to?: string;
  is_starred?: boolean;

  // AI analysis
  ai_summary?: string;
  ai_category?: EmailCategory;
  ai_priority?: EmailPriority;
  ai_sentiment?: EmailSentiment;
  ai_action_items?: string[];
  ai_reply_suggestions?: string[];

  created_at: string;
  updated_at?: string;
}
