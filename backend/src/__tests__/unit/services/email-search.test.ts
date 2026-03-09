/**
 * Email Search Service Tests - Phase 43
 */

import {
  parseNaturalLanguageQuery,
  formatSearchResultsForChat,
  formatInboxSummaryForChat,
} from '../../../services/email-search';

describe('Email Search Service', () => {
  describe('parseNaturalLanguageQuery', () => {
    it('should extract "from" filter', () => {
      const q = parseNaturalLanguageQuery('E-Mails von Max Mustermann');
      expect(q.from).toBe('Max Mustermann');
    });

    it('should extract "from" with English syntax', () => {
      const q = parseNaturalLanguageQuery('emails from john@example.com');
      expect(q.from).toBe('john@example.com');
    });

    it('should extract "to" filter', () => {
      const q = parseNaturalLanguageQuery('Mails an support@zensation.ai');
      expect(q.to).toBe('support@zensation.ai');
    });

    it('should extract date range with ISO format', () => {
      const q = parseNaturalLanguageQuery('E-Mails nach dem 2026-03-01');
      expect(q.after).toBe('2026-03-01');
    });

    it('should extract date range with German format', () => {
      const q = parseNaturalLanguageQuery('E-Mails vor dem 15.03.2026');
      expect(q.before).toBe('2026-03-15');
    });

    it('should handle "heute" (today)', () => {
      const q = parseNaturalLanguageQuery('E-Mails von heute');
      expect(q.after).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should handle "gestern" (yesterday)', () => {
      const q = parseNaturalLanguageQuery('E-Mails von gestern');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(q.after).toBe(yesterday.toISOString().split('T')[0]);
    });

    it('should extract category filter', () => {
      const q = parseNaturalLanguageQuery('zeig mir business E-Mails');
      expect(q.category).toBe('business');
    });

    it('should extract priority filter - urgent', () => {
      const q = parseNaturalLanguageQuery('dringende E-Mails');
      expect(q.priority).toBe('urgent');
    });

    it('should extract priority filter - high', () => {
      const q = parseNaturalLanguageQuery('wichtige E-Mails');
      expect(q.priority).toBe('high');
    });

    it('should extract direction - inbound', () => {
      const q = parseNaturalLanguageQuery('empfangene E-Mails');
      expect(q.direction).toBe('inbound');
    });

    it('should extract direction - outbound', () => {
      const q = parseNaturalLanguageQuery('gesendete E-Mails');
      expect(q.direction).toBe('outbound');
    });

    it('should detect starred filter', () => {
      const q = parseNaturalLanguageQuery('markierte E-Mails');
      expect(q.starred).toBe(true);
    });

    it('should detect attachment filter', () => {
      const q = parseNaturalLanguageQuery('E-Mails mit Anhang');
      expect(q.hasAttachments).toBe(true);
    });

    it('should detect action items filter', () => {
      const q = parseNaturalLanguageQuery('E-Mails mit Aufgaben');
      expect(q.hasActionItems).toBe(true);
    });

    it('should detect unread filter', () => {
      const q = parseNaturalLanguageQuery('ungelesene E-Mails');
      expect(q.status).toBe('received');
    });

    it('should extract remaining text as search query', () => {
      const q = parseNaturalLanguageQuery('E-Mails über Projektplanung');
      expect(q.text).toContain('Projektplanung');
    });

    it('should combine multiple filters', () => {
      const q = parseNaturalLanguageQuery('zeig mir dringende E-Mails von Max heute');
      expect(q.priority).toBe('urgent');
      expect(q.from).toContain('Max');
      expect(q.after).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should handle empty input gracefully', () => {
      const q = parseNaturalLanguageQuery('');
      expect(q.text).toBeUndefined();
      expect(q.from).toBeUndefined();
    });

    it('should handle this week', () => {
      const q = parseNaturalLanguageQuery('E-Mails diese Woche');
      expect(q.after).toBeDefined();
    });

    it('should handle this month', () => {
      const q = parseNaturalLanguageQuery('E-Mails diesen Monat');
      expect(q.after).toBeDefined();
      const afterDate = new Date(q.after!);
      expect(afterDate.getDate()).toBe(1); // First of month
    });
  });

  describe('formatSearchResultsForChat', () => {
    it('should format empty results', () => {
      const result = formatSearchResultsForChat({
        results: [],
        total: 0,
        query: {},
      });
      expect(result).toContain('Keine E-Mails gefunden');
    });

    it('should format results with email data', () => {
      const result = formatSearchResultsForChat({
        results: [{
          id: '1',
          subject: 'Test Subject',
          from_address: 'test@example.com',
          from_name: 'Test User',
          to_addresses: [],
          direction: 'inbound',
          status: 'received',
          received_at: '2026-03-09T10:00:00Z',
          ai_summary: 'Test summary',
          ai_category: 'business',
          ai_priority: 'high',
          ai_sentiment: 'neutral',
          ai_action_items: null,
          is_starred: false,
          has_attachments: false,
          thread_id: null,
          body_preview: 'Preview text',
          relevance_score: 0.8,
        }],
        total: 1,
        query: { text: 'test' },
      });

      expect(result).toContain('1 E-Mail gefunden');
      expect(result).toContain('Test Subject');
      expect(result).toContain('Test User');
      expect(result).toContain('Test summary');
    });

    it('should show priority emoji for urgent emails', () => {
      const result = formatSearchResultsForChat({
        results: [{
          id: '1',
          subject: 'Urgent!',
          from_address: 'a@b.com',
          from_name: null,
          to_addresses: [],
          direction: 'inbound',
          status: 'received',
          received_at: '2026-03-09T10:00:00Z',
          ai_summary: null,
          ai_category: null,
          ai_priority: 'urgent',
          ai_sentiment: null,
          ai_action_items: null,
          is_starred: true,
          has_attachments: false,
          thread_id: null,
          body_preview: '',
          relevance_score: 0.9,
        }],
        total: 1,
        query: {},
      });

      expect(result).toContain('🔴');
      expect(result).toContain('⭐');
    });

    it('should show action item count', () => {
      const result = formatSearchResultsForChat({
        results: [{
          id: '1',
          subject: 'Tasks',
          from_address: 'a@b.com',
          from_name: null,
          to_addresses: [],
          direction: 'inbound',
          status: 'read',
          received_at: '2026-03-09T10:00:00Z',
          ai_summary: null,
          ai_category: null,
          ai_priority: null,
          ai_sentiment: null,
          ai_action_items: JSON.stringify([{ text: 'Do this' }, { text: 'Do that' }]),
          is_starred: false,
          has_attachments: false,
          thread_id: null,
          body_preview: '',
          relevance_score: 0.5,
        }],
        total: 1,
        query: {},
      });

      expect(result).toContain('2 Aufgaben');
    });
  });

  describe('formatInboxSummaryForChat', () => {
    it('should format inbox summary', () => {
      const result = formatInboxSummaryForChat({
        total_emails: 42,
        unread: 5,
        by_category: { business: 20, personal: 15, newsletter: 7 },
        by_priority: { high: 3, medium: 30, low: 9 },
        by_sender: [
          { address: 'boss@work.com', name: 'Boss', count: 8 },
          { address: 'team@work.com', name: 'Team', count: 5 },
        ],
        recent_action_items: [{
          email_id: '1',
          subject: 'Project Update',
          items: [{ text: 'Review document' }],
        }],
        date_range: { oldest: '2026-01-01', newest: '2026-03-09' },
      });

      expect(result).toContain('42 E-Mails gesamt');
      expect(result).toContain('5 ungelesen');
      expect(result).toContain('business');
      expect(result).toContain('Boss');
      expect(result).toContain('Review document');
    });
  });
});
