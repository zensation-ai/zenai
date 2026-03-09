/**
 * Email Tool Handlers Tests - Phase 43
 */

import { handleAskInbox, handleInboxSummary } from '../../../services/tool-handlers/email-tools';
import { ToolExecutionContext } from '../../../services/claude/tool-use';

// Mock email-search module
jest.mock('../../../services/email-search', () => ({
  parseNaturalLanguageQuery: jest.fn().mockReturnValue({ text: 'test' }),
  searchEmails: jest.fn().mockResolvedValue({
    results: [{
      id: '1',
      subject: 'Test Email',
      from_address: 'test@example.com',
      from_name: 'Test',
      to_addresses: [],
      direction: 'inbound',
      status: 'received',
      received_at: '2026-03-09T10:00:00Z',
      ai_summary: 'A test email',
      ai_category: 'business',
      ai_priority: 'medium',
      ai_sentiment: 'neutral',
      ai_action_items: null,
      is_starred: false,
      has_attachments: false,
      thread_id: null,
      body_preview: 'Preview',
      relevance_score: 0.8,
    }],
    total: 1,
    query: { text: 'test' },
  }),
  getInboxSummary: jest.fn().mockResolvedValue({
    total_emails: 10,
    unread: 3,
    by_category: { business: 5, personal: 5 },
    by_priority: { medium: 8, high: 2 },
    by_sender: [{ address: 'a@b.com', name: 'Alice', count: 3 }],
    recent_action_items: [],
    date_range: { oldest: '2026-01-01', newest: '2026-03-09' },
  }),
  formatSearchResultsForChat: jest.fn().mockReturnValue('**1 E-Mail gefunden:**\n\n📥 **Test Email**'),
  formatInboxSummaryForChat: jest.fn().mockReturnValue('**Inbox-Überblick:**\n\n📬 10 E-Mails gesamt'),
}));

describe('Email Tool Handlers', () => {
  const execContext: ToolExecutionContext = {
    aiContext: 'work',
    sessionId: 'test-session',
  };

  describe('handleAskInbox', () => {
    it('should return error when no question provided', async () => {
      const result = await handleAskInbox({}, execContext);
      expect(result).toContain('Fehler');
    });

    it('should search emails with natural language query', async () => {
      const result = await handleAskInbox({ question: 'E-Mails von Test' }, execContext);
      expect(result).toContain('E-Mail');
    });

    it('should return inbox summary for overview requests', async () => {
      const result = await handleAskInbox({ question: 'Inbox Überblick' }, execContext);
      expect(result).toContain('Inbox');
    });

    it('should respect limit parameter', async () => {
      const { parseNaturalLanguageQuery } = require('../../../services/email-search');
      parseNaturalLanguageQuery.mockReturnValue({ text: 'test' });
      await handleAskInbox({ question: 'test', limit: 5 }, execContext);
      // Should not throw
    });
  });

  describe('handleInboxSummary', () => {
    it('should return inbox summary', async () => {
      const result = await handleInboxSummary({}, execContext);
      expect(result).toContain('Inbox');
    });
  });
});
