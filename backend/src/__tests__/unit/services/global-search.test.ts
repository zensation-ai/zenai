/**
 * Unit Tests for Global Search Service
 *
 * Tests unified search across ideas, documents, meetings, facts, chat, etc.
 */

import { queryContext } from '../../../utils/database-context';
import { globalSearch } from '../../../services/global-search';

// ===========================================
// Mocks
// ===========================================

jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
  isValidContext: (ctx: string) =>
    ['operations', 'finance', 'people', 'strategy'].includes(ctx),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

// ===========================================
// Tests
// ===========================================

describe('GlobalSearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  describe('search', () => {
    it('should return empty results for queries shorter than MIN_QUERY_LENGTH', async () => {
      const result = await globalSearch.search({ query: 'a' });

      expect(result.totalResults).toBe(0);
      expect(result.results).toEqual([]);
      expect(result.timing.totalMs).toBe(0);
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should search ideas across all contexts by default', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await globalSearch.search({ query: 'test query' });

      expect(result.query).toBe('test query');
      expect(result.totalResults).toBe(0);
      // Should search across all 4 contexts x 11 types = up to 44 queries
      expect(mockQueryContext).toHaveBeenCalled();
    });

    it('should search only specified types', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test query',
        types: ['idea'],
        contexts: ['operations'],
      });

      // Only 1 context x 1 type = 1 query
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('FROM ideas');
    });

    it('should search only specified contexts', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test',
        contexts: ['finance'],
        types: ['meeting'],
      });

      expect(mockQueryContext).toHaveBeenCalledTimes(1);
      expect(mockQueryContext).toHaveBeenCalledWith('finance', expect.any(String), expect.any(Array));
    });

    it('should return and sort results by score', async () => {
      const ideaRow = {
        id: 'idea-1',
        title: 'Test Idea',
        summary: 'A test summary',
        type: 'task',
        category: null,
        priority: 'high',
        created_at: new Date('2026-03-20'),
        score: 0.9,
      };
      const meetingRow = {
        id: 'meet-1',
        title: 'Test Meeting',
        notes: 'meeting notes',
        meeting_type: 'team',
        date: new Date('2026-03-19'),
        created_at: new Date('2026-03-19'),
        score: 0.5,
      };

      mockQueryContext
        .mockResolvedValueOnce({ rows: [ideaRow], rowCount: 1 } as any) // ideas
        .mockResolvedValueOnce({ rows: [meetingRow], rowCount: 1 } as any); // meetings

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea', 'meeting'],
        contexts: ['operations'],
      });

      expect(result.totalResults).toBe(2);
      expect(result.results[0].type).toBe('idea');
      expect(result.results[0].score).toBe(0.9);
      expect(result.results[1].type).toBe('meeting');
    });

    it('should deduplicate results by type:id', async () => {
      const row = {
        id: 'idea-dup',
        title: 'Dup Idea',
        summary: 'dup',
        type: 'task',
        category: null,
        priority: 'medium',
        created_at: new Date(),
        score: 0.8,
      };

      // Same idea returned from two contexts
      mockQueryContext
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'dup',
        types: ['idea'],
        contexts: ['operations', 'finance'],
      });

      expect(result.totalResults).toBe(1);
    });

    it('should limit results to MAX_LIMIT (50)', async () => {
      const rows = Array.from({ length: 60 }, (_, i) => ({
        id: `idea-${i}`,
        title: `Idea ${i}`,
        summary: 'sum',
        type: 'idea',
        category: null,
        priority: 'low',
        created_at: new Date(),
        score: 0.5,
      }));

      mockQueryContext.mockResolvedValue({ rows, rowCount: rows.length } as any);

      const result = await globalSearch.search({
        query: 'test query',
        types: ['idea'],
        contexts: ['operations'],
        limit: 100, // Over max
      });

      expect(result.totalResults).toBeLessThanOrEqual(50);
    });

    it('should not search facts when includeMemory is false', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: 'test',
        types: ['fact'],
        contexts: ['operations'],
        includeMemory: false,
      });

      // No queries should be made for facts
      expect(mockQueryContext).not.toHaveBeenCalled();
    });

    it('should handle individual search failures gracefully', async () => {
      // Ideas succeeds, documents fails
      mockQueryContext
        .mockResolvedValueOnce({ rows: [{ id: 'i1', title: 'OK', summary: '', type: 'idea', category: null, priority: 'low', created_at: new Date(), score: 0.8 }], rowCount: 1 } as any)
        .mockRejectedValueOnce(new Error('DB error'));

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea', 'document'],
        contexts: ['operations'],
      });

      // Should still return the successful idea result
      expect(result.totalResults).toBe(1);
      expect(result.results[0].type).toBe('idea');
    });

    it('should include timing information', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const result = await globalSearch.search({
        query: 'test',
        types: ['idea'],
        contexts: ['operations'],
      });

      expect(result.timing.totalMs).toBeGreaterThanOrEqual(0);
      expect(result.timing.perType).toHaveProperty('parallel_search');
    });

    it('should escape percent signs in query', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      await globalSearch.search({
        query: '50% discount',
        types: ['idea'],
        contexts: ['operations'],
      });

      const params = mockQueryContext.mock.calls[0][2] as string[];
      // The search pattern should have the % stripped from original query
      expect(params[1]).toBe('%50 discount%');
    });

    it('should search chat history including both user and assistant messages', async () => {
      const chatRows = [
        {
          id: 'msg-1',
          content: 'Wie funktioniert React?',
          role: 'user',
          session_id: 'sess-1',
          session_title: 'React Chat',
          created_at: new Date('2026-03-20'),
          score: 0.7,
        },
        {
          id: 'msg-2',
          content: 'React ist eine JavaScript-Bibliothek fuer User Interfaces...',
          role: 'assistant',
          session_id: 'sess-2',
          session_title: 'React Erklaerung',
          created_at: new Date('2026-03-20'),
          score: 0.7,
        },
      ];

      mockQueryContext.mockResolvedValue({ rows: chatRows, rowCount: 2 } as any);

      const result = await globalSearch.search({
        query: 'React',
        types: ['chat'],
        contexts: ['operations'],
      });

      // Should return results from both sessions (different session_ids avoid dedup)
      expect(result.totalResults).toBe(2);

      // Verify the SQL does NOT filter by role = 'user' (both roles are searched)
      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).not.toContain("m.role = 'user'");
      expect(sql).toContain('FROM general_chat_messages');
    });

    it('should search contacts via global search', async () => {
      const contactRow = {
        id: 'contact-1',
        display_name: 'Max Mustermann',
        email: ['max@example.com'],
        role: 'Developer',
        organization_id: null,
        relationship_type: 'colleague',
        ai_summary: 'Frontend developer at Acme Corp',
        created_at: new Date('2026-03-20'),
        score: 0.9,
      };

      mockQueryContext.mockResolvedValue({ rows: [contactRow], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'Max',
        types: ['contact'],
        contexts: ['operations'],
      });

      expect(result.totalResults).toBe(1);
      expect(result.results[0].type).toBe('contact');
      expect(result.results[0].title).toBe('Max Mustermann');
    });

    it('should search emails via global search', async () => {
      const emailRow = {
        id: 'email-1',
        subject: 'Project Update Q1',
        from_address: 'boss@company.com',
        to_addresses: ['me@company.com'],
        ai_summary: 'Q1 results exceeded expectations',
        direction: 'inbound',
        status: 'read',
        created_at: new Date('2026-03-20'),
        score: 0.85,
      };

      mockQueryContext.mockResolvedValue({ rows: [emailRow], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'Project Update',
        types: ['email'],
        contexts: ['finance'],
      });

      expect(result.totalResults).toBe(1);
      expect(result.results[0].type).toBe('email');
      expect(result.results[0].title).toBe('Project Update Q1');
    });

    it('should search calendar events via global search', async () => {
      const calendarRow = {
        id: 'cal-1',
        title: 'Team Standup',
        description: 'Daily sync meeting',
        location: 'Zoom',
        start_time: new Date('2026-03-21T09:00:00'),
        end_time: new Date('2026-03-21T09:30:00'),
        created_at: new Date('2026-03-20'),
        score: 0.85,
      };

      mockQueryContext.mockResolvedValue({ rows: [calendarRow], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'Standup',
        types: ['calendar_event'],
        contexts: ['finance'],
      });

      expect(result.totalResults).toBe(1);
      expect(result.results[0].type).toBe('calendar_event');
      expect(result.results[0].title).toBe('Team Standup');
    });

    it('should search across multiple types simultaneously', async () => {
      const ideaRow = {
        id: 'idea-multi',
        title: 'Budget Planning',
        summary: 'Annual budget',
        type: 'idea',
        category: null,
        priority: 'high',
        created_at: new Date(),
        score: 0.9,
      };
      const emailRow = {
        id: 'email-multi',
        subject: 'Budget Review',
        from_address: 'cfo@company.com',
        to_addresses: [],
        ai_summary: 'Budget review needed',
        direction: 'inbound',
        status: 'unread',
        created_at: new Date(),
        score: 0.85,
      };
      const transRow = {
        id: 'trans-1',
        description: 'Budget allocation',
        amount: 5000,
        type: 'expense',
        category: 'Operations',
        account_id: 'acc-1',
        transaction_date: new Date(),
        created_at: new Date(),
        score: 0.6,
      };

      mockQueryContext
        .mockResolvedValueOnce({ rows: [ideaRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [emailRow], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [transRow], rowCount: 1 } as any);

      const result = await globalSearch.search({
        query: 'Budget',
        types: ['idea', 'email', 'transaction'],
        contexts: ['finance'],
      });

      expect(result.totalResults).toBe(3);
      // Sorted by score descending
      expect(result.results[0].score).toBeGreaterThanOrEqual(result.results[1].score);
      expect(result.results[1].score).toBeGreaterThanOrEqual(result.results[2].score);
    });
  });
});
