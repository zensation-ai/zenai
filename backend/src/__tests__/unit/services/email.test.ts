/**
 * Email Service Tests
 *
 * Tests for email CRUD, threading, status management,
 * stats, and account operations.
 */

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../../services/resend', () => ({
  sendEmail: jest.fn().mockResolvedValue({ id: 'resend-abc-123' }),
  isResendConfigured: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../middleware/errorHandler', () => ({
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) { super(`${msg} not found`); this.name = 'NotFoundError'; }
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-1234'),
}));

import {
  getEmails,
  getEmail,
  getThread,
  createDraft,
  updateDraft,
  sendEmailById,
  updateEmailStatus,
  markAsRead,
  toggleStar,
  batchUpdateStatus,
  moveToTrash,
  getEmailStats,
  getAccounts,
  getAccount,
  createAccount,
  deleteAccount,
  getLabels,
  createLabel,
} from '../../../services/email';
import { isResendConfigured } from '../../../services/resend';

// ===========================================
// Test Helpers
// ===========================================

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

function makeEmailRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'email-001',
    resend_email_id: null,
    account_id: 'acct-001',
    direction: 'inbound',
    status: 'received',
    from_address: 'sender@example.com',
    from_name: 'Sender',
    to_addresses: JSON.stringify([{ email: 'me@zensation.ai' }]),
    cc_addresses: '[]',
    bcc_addresses: '[]',
    subject: 'Test Subject',
    body_html: '<p>Hello</p>',
    body_text: 'Hello',
    reply_to_id: null,
    thread_id: 'thread-001',
    message_id: '<msg-001@example.com>',
    in_reply_to: null,
    has_attachments: false,
    attachments: '[]',
    ai_summary: null,
    ai_category: 'business',
    ai_priority: 'medium',
    ai_sentiment: 'neutral',
    ai_action_items: '[]',
    ai_reply_suggestions: '[]',
    ai_processed_at: null,
    labels: '[]',
    is_starred: false,
    context: 'work',
    metadata: '{}',
    received_at: '2026-03-20T10:00:00Z',
    sent_at: null,
    created_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T10:00:00Z',
    account_email: 'me@zensation.ai',
    account_display_name: 'Me',
    thread_count: 1,
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // -------------------------------------------
  // getEmails
  // -------------------------------------------
  describe('getEmails', () => {
    it('should list emails with default filters', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '5' }] } as any)
        .mockResolvedValueOnce({ rows: [makeEmailRow(), makeEmailRow({ id: 'email-002' })] } as any);

      const result = await getEmails('work', {}, TEST_USER_ID);
      expect(result.total).toBe(5);
      expect(result.emails).toHaveLength(2);
      expect(result.emails[0].id).toBe('email-001');
    });

    it('should filter by folder=inbox (inbound, not archived/trash)', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '3' }] } as any)
        .mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      await getEmails('work', { folder: 'inbox' }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('direction');
    });

    it('should filter by folder=drafts', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeEmailRow({ status: 'draft' })] } as any);

      await getEmails('work', { folder: 'drafts' }, TEST_USER_ID);
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should apply search filter across subject, body, and from', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '1' }] } as any)
        .mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      await getEmails('work', { search: 'invoice' }, TEST_USER_ID);

      const countSql = mockQueryContext.mock.calls[0][1] as string;
      expect(countSql).toContain('ILIKE');
    });

    it('should limit results to max 200', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '500' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      await getEmails('work', { limit: 999 }, TEST_USER_ID);

      const params = mockQueryContext.mock.calls[1][2] as unknown[];
      // The limit param should be capped at 200
      expect(params).toContain(200);
    });

    it('should handle empty results', async () => {
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any)
        .mockResolvedValueOnce({ rows: [] } as any);

      const result = await getEmails('work', {}, TEST_USER_ID);
      expect(result.total).toBe(0);
      expect(result.emails).toHaveLength(0);
    });
  });

  // -------------------------------------------
  // getEmail
  // -------------------------------------------
  describe('getEmail', () => {
    it('should return a single email by id', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [makeEmailRow()] } as any);

      const email = await getEmail('work', 'email-001', TEST_USER_ID);
      expect(email).not.toBeNull();
      expect(email!.id).toBe('email-001');
      expect(email!.from_address).toBe('sender@example.com');
    });

    it('should return null if email not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const email = await getEmail('work', 'nonexistent', TEST_USER_ID);
      expect(email).toBeNull();
    });

    it('should parse JSON fields correctly', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({
          to_addresses: JSON.stringify([{ email: 'a@b.com', name: 'A' }, { email: 'c@d.com' }]),
          ai_action_items: JSON.stringify([{ text: 'Follow up', done: false }]),
        })],
      } as any);

      const email = await getEmail('work', 'email-001', TEST_USER_ID);
      expect(email!.to_addresses).toHaveLength(2);
      expect(email!.ai_action_items).toHaveLength(1);
      expect(email!.ai_action_items[0].text).toBe('Follow up');
    });
  });

  // -------------------------------------------
  // getThread
  // -------------------------------------------
  describe('getThread', () => {
    it('should return all emails in a thread', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeEmailRow({ id: 'email-001' }),
          makeEmailRow({ id: 'email-002', subject: 'Re: Test Subject' }),
        ],
      } as any);

      const thread = await getThread('work', 'thread-001', TEST_USER_ID);
      expect(thread).toHaveLength(2);
    });

    it('should return empty array for unknown thread', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const thread = await getThread('work', 'unknown-thread', TEST_USER_ID);
      expect(thread).toHaveLength(0);
    });
  });

  // -------------------------------------------
  // createDraft
  // -------------------------------------------
  describe('createDraft', () => {
    it('should create a draft with default from address', async () => {
      // Default account lookup
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ email_address: 'default@zensation.ai', display_name: 'Default' }],
      } as any);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'draft', direction: 'outbound' })],
      } as any);

      const draft = await createDraft('work', {
        to_addresses: [{ email: 'recipient@test.com' }],
        subject: 'Draft Subject',
      }, TEST_USER_ID);

      expect(draft).toBeDefined();
      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });

    it('should use specified account_id for from address', async () => {
      // Account lookup by ID
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ email_address: 'custom@zensation.ai', display_name: 'Custom' }],
      } as any);
      // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'draft', from_address: 'custom@zensation.ai' })],
      } as any);

      await createDraft('work', {
        to_addresses: [{ email: 'r@test.com' }],
        account_id: 'acct-custom',
      }, TEST_USER_ID);

      expect(mockQueryContext).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------
  // updateDraft
  // -------------------------------------------
  describe('updateDraft', () => {
    it('should update draft fields', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'draft', subject: 'Updated Subject' })],
      } as any);

      const result = await updateDraft('work', 'email-001', {
        subject: 'Updated Subject',
        body_text: 'New body',
      }, TEST_USER_ID);

      expect(result).not.toBeNull();
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('UPDATE emails');
      expect(sql).toContain("status = 'draft'");
    });

    it('should return null if draft not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await updateDraft('work', 'nonexistent', { subject: 'X' }, TEST_USER_ID);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------
  // sendEmailById
  // -------------------------------------------
  describe('sendEmailById', () => {
    it('should throw if Resend is not configured', async () => {
      (isResendConfigured as jest.Mock).mockReturnValueOnce(false);

      await expect(sendEmailById('work', 'email-001', TEST_USER_ID))
        .rejects.toThrow('Resend is not configured');
    });

    it('should transition draft to sending then to sent', async () => {
      // Lock: draft -> sending
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'sending' })],
      } as any);
      // Mark as sent
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'sent', resend_email_id: 'resend-abc-123' })],
      } as any);

      const result = await sendEmailById('work', 'email-001', TEST_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('sent');
    });

    it('should return null if email is not a draft (lock fails, not found)', async () => {
      // Lock fails (not a draft)
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // getEmail also returns null
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await sendEmailById('work', 'nonexistent', TEST_USER_ID);
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------
  // Status Updates
  // -------------------------------------------
  describe('updateEmailStatus', () => {
    it('should update status to archived', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'archived' })],
      } as any);

      const result = await updateEmailStatus('work', 'email-001', 'archived', TEST_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('archived');
    });

    it('should return null if email not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await updateEmailStatus('work', 'nonexistent', 'archived', TEST_USER_ID);
      expect(result).toBeNull();
    });
  });

  describe('markAsRead', () => {
    it('should mark received email as read', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'read' })],
      } as any);

      const result = await markAsRead('work', 'email-001', TEST_USER_ID);
      expect(result).not.toBeNull();
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain("status = 'read'");
      expect(sql).toContain("status = 'received'");
    });
  });

  describe('toggleStar', () => {
    it('should toggle starred status', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ is_starred: true })],
      } as any);

      const result = await toggleStar('work', 'email-001', TEST_USER_ID);
      expect(result).not.toBeNull();
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('NOT is_starred');
    });
  });

  describe('batchUpdateStatus', () => {
    it('should update multiple emails at once', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 3 } as any);

      const count = await batchUpdateStatus('work', ['e1', 'e2', 'e3'], 'archived', TEST_USER_ID);
      expect(count).toBe(3);
    });

    it('should return 0 when no emails matched', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0 } as any);

      const count = await batchUpdateStatus('work', ['nonexistent'], 'trash', TEST_USER_ID);
      expect(count).toBe(0);
    });
  });

  describe('moveToTrash', () => {
    it('should delegate to updateEmailStatus with trash', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeEmailRow({ status: 'trash' })],
      } as any);

      const result = await moveToTrash('work', 'email-001', TEST_USER_ID);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('trash');
    });
  });

  // -------------------------------------------
  // Stats
  // -------------------------------------------
  describe('getEmailStats', () => {
    it('should return aggregated email statistics', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total: '42',
          unread: '5',
          starred: '3',
          by_category: { business: 20, personal: 15, newsletter: 7 },
          by_account: [{ account_id: 'acct-001', email: 'me@zensation.ai', count: 42 }],
        }],
      } as any);

      const stats = await getEmailStats('work', TEST_USER_ID);
      expect(stats.total).toBe(42);
      expect(stats.unread).toBe(5);
      expect(stats.starred).toBe(3);
      expect(stats.by_category).toHaveProperty('business');
    });

    it('should handle empty stats gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          total: '0',
          unread: '0',
          starred: '0',
          by_category: {},
          by_account: [],
        }],
      } as any);

      const stats = await getEmailStats('work', TEST_USER_ID);
      expect(stats.total).toBe(0);
      expect(stats.by_account).toHaveLength(0);
    });
  });

  // -------------------------------------------
  // Accounts
  // -------------------------------------------
  describe('getAccounts', () => {
    it('should list email accounts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'acct-1', email_address: 'a@zensation.ai', is_default: true },
          { id: 'acct-2', email_address: 'b@zensation.ai', is_default: false },
        ],
      } as any);

      const accounts = await getAccounts('work', TEST_USER_ID);
      expect(accounts).toHaveLength(2);
    });
  });

  describe('getAccount', () => {
    it('should return a single account', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'acct-1', email_address: 'a@zensation.ai' }],
      } as any);

      const account = await getAccount('work', 'acct-1', TEST_USER_ID);
      expect(account).not.toBeNull();
    });

    it('should return undefined for nonexistent account', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const account = await getAccount('work', 'nonexistent', TEST_USER_ID);
      expect(account).toBeFalsy();
    });
  });

  describe('createAccount', () => {
    it('should create a new email account', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'test-uuid-1234', email_address: 'new@zensation.ai', domain: 'zensation.ai' }],
      } as any);

      const account = await createAccount('work', {
        email_address: 'new@zensation.ai',
        domain: 'zensation.ai',
      }, TEST_USER_ID);

      expect(account).toBeDefined();
      expect(account.email_address).toBe('new@zensation.ai');
    });
  });

  describe('deleteAccount', () => {
    it('should delete an email account', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 } as any);

      await deleteAccount('work', 'acct-1', TEST_USER_ID);
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('DELETE FROM email_accounts');
    });
  });

  // -------------------------------------------
  // Labels
  // -------------------------------------------
  describe('getLabels', () => {
    it('should list email labels', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          { id: 'lbl-1', name: 'Important', color: '#ff0000' },
          { id: 'lbl-2', name: 'Work', color: '#0000ff' },
        ],
      } as any);

      const labels = await getLabels('work', TEST_USER_ID);
      expect(labels).toHaveLength(2);
    });
  });

  describe('createLabel', () => {
    it('should create a label with defaults', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'test-uuid-1234', name: 'Urgent', color: '#4A90D9', icon: '🏷️' }],
      } as any);

      const label = await createLabel('work', { name: 'Urgent' }, TEST_USER_ID);
      expect(label.name).toBe('Urgent');
    });
  });
});
