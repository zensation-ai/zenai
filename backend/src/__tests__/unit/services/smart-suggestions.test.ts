/**
 * Smart Suggestions Service Tests (Phase 69.1)
 */

import {
  getActiveSuggestions,
  dismissSuggestion,
  snoozeSuggestion,
  acceptSuggestion,
  createSuggestion,
} from '../../../services/smart-suggestions';
import type { SuggestionType } from '../../../services/smart-suggestions';

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

describe('SmartSuggestionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ─── getActiveSuggestions ─────────────────────────────

  describe('getActiveSuggestions', () => {
    it('returns parsed suggestions sorted by priority', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          {
            id: 'aaa',
            user_id: TEST_USER_ID,
            type: 'task_reminder',
            title: 'Aufgabe faellig',
            description: 'Deine Aufgabe ist ueberfaellig',
            metadata: { taskId: '123' },
            priority: '80',
            status: 'active',
            snoozed_until: null,
            dismissed_at: null,
            created_at: '2026-03-14T10:00:00Z',
          },
          {
            id: 'bbb',
            user_id: TEST_USER_ID,
            type: 'knowledge_insight',
            title: 'Neues Muster erkannt',
            description: null,
            metadata: '{}',
            priority: '60',
            status: 'active',
            snoozed_until: null,
            dismissed_at: null,
            created_at: '2026-03-14T09:00:00Z',
          },
        ],
      });

      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID, 3);
      expect(suggestions).toHaveLength(2);
      expect(suggestions[0].id).toBe('aaa');
      expect(suggestions[0].type).toBe('task_reminder');
      expect(suggestions[0].priority).toBe(80);
      expect(suggestions[0].metadata).toEqual({ taskId: '123' });
      expect(suggestions[1].description).toBeNull();
    });

    it('returns empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID);
      expect(suggestions).toEqual([]);
    });

    it('passes limit parameter to query', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      await getActiveSuggestions('work', TEST_USER_ID, 5);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'work',
        expect.stringContaining('LIMIT $2'),
        [TEST_USER_ID, 5]
      );
    });
  });

  // ─── dismissSuggestion ─────────────────────────────────

  describe('dismissSuggestion', () => {
    it('returns true when suggestion is dismissed', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'aaa' }] });
      const result = await dismissSuggestion('personal', 'aaa', TEST_USER_ID);
      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'dismissed'"),
        ['aaa', TEST_USER_ID]
      );
    });

    it('returns false when suggestion not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const result = await dismissSuggestion('personal', 'nonexistent', TEST_USER_ID);
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await dismissSuggestion('personal', 'aaa', TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  // ─── snoozeSuggestion ──────────────────────────────────

  describe('snoozeSuggestion', () => {
    it('snoozes for 1 hour', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'aaa' }] });
      const result = await snoozeSuggestion('personal', 'aaa', TEST_USER_ID, '1h');
      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'snoozed'"),
        ['aaa', TEST_USER_ID, '1 hour']
      );
    });

    it('snoozes for 4 hours', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'aaa' }] });
      await snoozeSuggestion('personal', 'aaa', TEST_USER_ID, '4h');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        ['aaa', TEST_USER_ID, '4 hours']
      );
    });

    it('snoozes until tomorrow (16 hours)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'aaa' }] });
      await snoozeSuggestion('personal', 'aaa', TEST_USER_ID, 'tomorrow');
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.any(String),
        ['aaa', TEST_USER_ID, '16 hours']
      );
    });

    it('returns false when suggestion not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const result = await snoozeSuggestion('personal', 'x', TEST_USER_ID, '1h');
      expect(result).toBe(false);
    });
  });

  // ─── acceptSuggestion ─────────────────────────────────

  describe('acceptSuggestion', () => {
    it('returns true when accepted', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'aaa' }] });
      const result = await acceptSuggestion('personal', 'aaa', TEST_USER_ID);
      expect(result).toBe(true);
      expect(mockQueryContext).toHaveBeenCalledWith(
        'personal',
        expect.stringContaining("status = 'accepted'"),
        ['aaa', TEST_USER_ID]
      );
    });

    it('returns false when not found', async () => {
      mockQueryContext.mockResolvedValueOnce({ rowCount: 0, rows: [] });
      const result = await acceptSuggestion('personal', 'nonexistent', TEST_USER_ID);
      expect(result).toBe(false);
    });
  });

  // ─── createSuggestion ─────────────────────────────────

  describe('createSuggestion', () => {
    it('creates a new suggestion', async () => {
      // Dedup check
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Insert
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'new-id',
          user_id: TEST_USER_ID,
          type: 'task_reminder',
          title: 'Test',
          description: 'Test desc',
          metadata: {},
          priority: '70',
          status: 'active',
          snoozed_until: null,
          dismissed_at: null,
          created_at: '2026-03-14T10:00:00Z',
        }],
      });

      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'Test',
        description: 'Test desc',
        priority: 70,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('new-id');
      expect(result?.priority).toBe(70);
    });

    it('deduplicates by type and title', async () => {
      // Dedup check finds existing
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'Already exists',
      });

      expect(result).toBeNull();
      // Should only call once (dedup check), not insert
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('returns null on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'knowledge_insight' as SuggestionType,
        title: 'Test',
      });
      expect(result).toBeNull();
    });
  });
});
