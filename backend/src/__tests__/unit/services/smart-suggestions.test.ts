/**
 * Smart Suggestions Service Tests (Phase 69.1 + Phase 115)
 *
 * T55: Scoring algorithm tests
 * T56: Personalized timing pattern tests
 * T57: Dedup + merge tests
 * T58: All edge cases
 */

import {
  getActiveSuggestions,
  dismissSuggestion,
  snoozeSuggestion,
  acceptSuggestion,
  createSuggestion,
  computeRelevanceScore,
  computeRecencyDecay,
  computeInteractionBoost,
  computeTitleSimilarity,
  recordUserActivity,
  getUserActivityPattern,
  resetActivityData,
  getPersonalizedSuggestions,
  mergeRelatedSuggestions,
  enforceMaxActiveSuggestions,
  TYPE_WEIGHTS,
  MAX_ACTIVE_SUGGESTIONS,
  SIMILARITY_THRESHOLD,
} from '../../../services/smart-suggestions';
import type { SuggestionType, SmartSuggestion } from '../../../services/smart-suggestions';

// Mock database
const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
  isValidContext: (c: string) => ['personal', 'work', 'learning', 'creative'].includes(c),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

// ===========================================
// Test Helpers
// ===========================================

const TEST_USER_ID = '11111111-1111-1111-1111-111111111111';

function makeSuggestion(overrides: Partial<SmartSuggestion> = {}): SmartSuggestion {
  return {
    id: 'test-id',
    userId: TEST_USER_ID,
    type: 'task_reminder' as const,
    title: 'Test Suggestion',
    description: null,
    metadata: {},
    priority: 50,
    status: 'active' as const,
    snoozedUntil: null,
    dismissedAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeDbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'test-id',
    user_id: TEST_USER_ID,
    type: 'task_reminder',
    title: 'Test Suggestion',
    description: null,
    metadata: {},
    priority: '50',
    status: 'active',
    snoozed_until: null,
    dismissed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ===========================================
// Tests
// ===========================================

describe('SmartSuggestionsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
    resetActivityData();
  });

  // ─── T55: computeRelevanceScore ──────────────────────

  describe('computeRelevanceScore', () => {
    const now = new Date('2026-03-20T12:00:00Z');

    describe('type weights', () => {
      it.each([
        ['contradiction_alert', 90],
        ['meeting_prep', 85],
        ['task_reminder', 80],
        ['email_followup', 75],
        ['knowledge_insight', 60],
        ['connection_discovered', 50],
        ['learning_opportunity', 40],
        ['context_switch', 30],
      ] as const)('scores %s with base weight %d when fresh', (type, expectedWeight) => {
        const suggestion = makeSuggestion({
          type,
          createdAt: now.toISOString(), // 0ms age = recency 1.0
        });
        const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
        expect(score).toBe(expectedWeight);
      });
    });

    describe('recency decay', () => {
      it('returns 1.0 for suggestions within the last hour', () => {
        expect(computeRecencyDecay(0)).toBe(1.0);
        expect(computeRecencyDecay(30 * 60 * 1000)).toBe(1.0); // 30min
        expect(computeRecencyDecay(60 * 60 * 1000)).toBe(1.0); // exactly 1h
      });

      it('returns 0.85 for suggestions between 1-4 hours old', () => {
        expect(computeRecencyDecay(2 * 60 * 60 * 1000)).toBe(0.85); // 2h
        expect(computeRecencyDecay(4 * 60 * 60 * 1000)).toBe(0.85); // exactly 4h
      });

      it('returns 0.6 for suggestions between 4-24 hours old', () => {
        expect(computeRecencyDecay(5 * 60 * 60 * 1000)).toBe(0.6); // 5h
        expect(computeRecencyDecay(24 * 60 * 60 * 1000)).toBe(0.6); // exactly 24h
      });

      it('returns 0.3 for suggestions older than 24 hours', () => {
        expect(computeRecencyDecay(25 * 60 * 60 * 1000)).toBe(0.3);
        expect(computeRecencyDecay(7 * 24 * 60 * 60 * 1000)).toBe(0.3); // 7 days
      });

      it('applies decay to score correctly', () => {
        // task_reminder = 80, 2 hours old = 0.85 decay
        const suggestion = makeSuggestion({
          type: 'task_reminder',
          createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
        });
        const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
        expect(score).toBe(Math.round(80 * 0.85)); // 68
      });

      it('applies heavy decay to old suggestions', () => {
        // knowledge_insight = 60, 2 days old = 0.3 decay
        const suggestion = makeSuggestion({
          type: 'knowledge_insight',
          createdAt: new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString(),
        });
        const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
        expect(score).toBe(Math.round(60 * 0.3)); // 18
      });
    });

    describe('interaction boost', () => {
      it('returns 1.0 when no prior interactions', () => {
        const boost = computeInteractionBoost('personal', TEST_USER_ID, 'task_reminder');
        expect(boost).toBe(1.0);
      });

      it('returns 1.2 when user has accepted that type before', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        const boost = computeInteractionBoost('personal', TEST_USER_ID, 'task_reminder');
        expect(boost).toBe(1.2);
      });

      it('does not boost for dismiss-only interactions', () => {
        recordUserActivity('personal', TEST_USER_ID, 'dismiss', 'task_reminder');
        const boost = computeInteractionBoost('personal', TEST_USER_ID, 'task_reminder');
        expect(boost).toBe(1.0);
      });

      it('boosts only the accepted type, not others', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        const taskBoost = computeInteractionBoost('personal', TEST_USER_ID, 'task_reminder');
        const emailBoost = computeInteractionBoost('personal', TEST_USER_ID, 'email_followup');
        expect(taskBoost).toBe(1.2);
        expect(emailBoost).toBe(1.0);
      });

      it('applies boost to full score calculation', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        const suggestion = makeSuggestion({
          type: 'task_reminder',
          createdAt: now.toISOString(),
        });
        const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
        // 80 * 1.0 (recency) * 1.2 (boost) = 96
        expect(score).toBe(96);
      });

      it('clamps score to 100 max', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'contradiction_alert');
        const suggestion = makeSuggestion({
          type: 'contradiction_alert',
          createdAt: now.toISOString(),
        });
        const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
        // 90 * 1.0 * 1.2 = 108 → clamped to 100
        expect(score).toBe(100);
      });

      it('isolates boost per context', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        const personalBoost = computeInteractionBoost('personal', TEST_USER_ID, 'task_reminder');
        const workBoost = computeInteractionBoost('work', TEST_USER_ID, 'task_reminder');
        expect(personalBoost).toBe(1.2);
        expect(workBoost).toBe(1.0);
      });
    });

    it('handles combined factors: type + decay + boost', () => {
      recordUserActivity('personal', TEST_USER_ID, 'accept', 'email_followup');
      // email_followup = 75, 5h old = 0.6 decay, boost = 1.2
      const suggestion = makeSuggestion({
        type: 'email_followup',
        createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      });
      const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID, now);
      expect(score).toBe(Math.round(75 * 0.6 * 1.2)); // 54
    });
  });

  // ─── T56: Personalized Timing Patterns ───────────────

  describe('personalized timing patterns', () => {
    describe('recordUserActivity', () => {
      it('tracks accept actions per type', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'email_followup');

        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        expect(pattern.totalInteractions).toBe(3);
        expect(pattern.preferredTypes).toContain('task_reminder');
        expect(pattern.preferredTypes[0]).toBe('task_reminder'); // highest count first
      });

      it('tracks dismiss actions for timing but not preferred types', () => {
        recordUserActivity('personal', TEST_USER_ID, 'dismiss', 'task_reminder');
        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        expect(pattern.totalInteractions).toBe(1);
        expect(pattern.preferredTypes).toHaveLength(0);
      });

      it('records hour-of-day activity', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        const currentHour = new Date().getHours();
        expect(pattern.peakHours).toContain(currentHour);
      });
    });

    describe('getUserActivityPattern', () => {
      it('returns empty pattern for new users', () => {
        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        expect(pattern.peakHours).toEqual([]);
        expect(pattern.preferredTypes).toEqual([]);
        expect(pattern.totalInteractions).toBe(0);
      });

      it('returns up to 3 peak hours', () => {
        // Simulate varied-hour activity by calling multiple times
        for (let i = 0; i < 5; i++) {
          recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        }
        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        // All activity at the same hour, so only 1 peak hour
        expect(pattern.peakHours.length).toBeGreaterThanOrEqual(1);
        expect(pattern.peakHours.length).toBeLessThanOrEqual(3);
      });

      it('sorts preferred types by accept count descending', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'email_followup');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');

        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        expect(pattern.preferredTypes[0]).toBe('task_reminder');
        expect(pattern.preferredTypes[1]).toBe('email_followup');
      });

      it('isolates patterns per context', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        recordUserActivity('work', TEST_USER_ID, 'accept', 'email_followup');

        const personalPattern = getUserActivityPattern('personal', TEST_USER_ID);
        const workPattern = getUserActivityPattern('work', TEST_USER_ID);

        expect(personalPattern.preferredTypes).toEqual(['task_reminder']);
        expect(workPattern.preferredTypes).toEqual(['email_followup']);
      });
    });

    describe('resetActivityData', () => {
      it('clears all activity data', () => {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
        resetActivityData();
        const pattern = getUserActivityPattern('personal', TEST_USER_ID);
        expect(pattern.totalInteractions).toBe(0);
      });
    });

    describe('getPersonalizedSuggestions', () => {
      it('returns scored suggestions when no activity data exists', async () => {
        mockQueryContext.mockResolvedValueOnce({
          rows: [
            makeDbRow({ id: 'a', type: 'task_reminder', priority: '80' }),
            makeDbRow({ id: 'b', type: 'knowledge_insight', priority: '60' }),
          ],
        });

        const suggestions = await getPersonalizedSuggestions('personal', TEST_USER_ID, 3);
        expect(suggestions.length).toBeLessThanOrEqual(3);
        // Should still be scored (task_reminder first due to higher type weight)
        if (suggestions.length >= 2) {
          expect((suggestions[0].relevanceScore ?? 0)).toBeGreaterThanOrEqual(
            (suggestions[1].relevanceScore ?? 0)
          );
        }
      });

      it('boosts preferred types when activity data exists', async () => {
        // Build activity: user prefers knowledge_insight
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'knowledge_insight');
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'knowledge_insight');

        mockQueryContext.mockResolvedValueOnce({
          rows: [
            makeDbRow({ id: 'a', type: 'context_switch', priority: '30' }),
            makeDbRow({ id: 'b', type: 'knowledge_insight', priority: '60' }),
          ],
        });

        const suggestions = await getPersonalizedSuggestions('personal', TEST_USER_ID, 3);
        expect(suggestions.length).toBeGreaterThan(0);
      });

      it('returns empty array on DB error', async () => {
        mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
        const suggestions = await getPersonalizedSuggestions('personal', TEST_USER_ID);
        expect(suggestions).toEqual([]);
      });
    });
  });

  // ─── T57: Title Similarity (Dedup) ──────────────────

  describe('computeTitleSimilarity', () => {
    it('returns 1.0 for identical titles', () => {
      expect(computeTitleSimilarity('Aufgabe erledigen', 'Aufgabe erledigen')).toBe(1.0);
    });

    it('returns 1.0 for case-insensitive identical titles', () => {
      expect(computeTitleSimilarity('Aufgabe Erledigen', 'aufgabe erledigen')).toBe(1.0);
    });

    it('returns high similarity for nearly identical titles', () => {
      const sim = computeTitleSimilarity(
        'Bericht an Chef schicken',
        'Bericht an den Chef schicken'
      );
      expect(sim).toBeGreaterThan(0.7);
    });

    it('returns low similarity for completely different titles', () => {
      const sim = computeTitleSimilarity(
        'Einkaufen gehen',
        'Meeting vorbereiten morgen'
      );
      expect(sim).toBeLessThan(0.3);
    });

    it('returns 0.0 when one title is empty', () => {
      expect(computeTitleSimilarity('Test', '')).toBe(0.0);
      expect(computeTitleSimilarity('', 'Test')).toBe(0.0);
    });

    it('returns 1.0 when both titles are empty', () => {
      expect(computeTitleSimilarity('', '')).toBe(1.0);
    });

    it('ignores punctuation', () => {
      const sim = computeTitleSimilarity('Aufgabe: erledigen!', 'Aufgabe erledigen');
      expect(sim).toBe(1.0);
    });

    it('filters single-character words', () => {
      // "a" and "I" should be filtered out
      const sim = computeTitleSimilarity('a big task', 'big task');
      expect(sim).toBe(1.0); // both reduce to ['big', 'task']
    });

    it('handles German umlauts', () => {
      const sim = computeTitleSimilarity('Überprüfung der Änderung', 'überprüfung der änderung');
      expect(sim).toBe(1.0);
    });

    it('correctly computes Jaccard overlap', () => {
      // "task one two" vs "task two three" → intersection: {task, two} = 2, union: {task, one, two, three} = 4
      const sim = computeTitleSimilarity('task one two', 'task two three');
      expect(sim).toBe(0.5);
    });

    it('is above threshold for similar suggestions', () => {
      const sim = computeTitleSimilarity(
        'E-Mail an Team senden',
        'E-Mail ans Team schicken senden'
      );
      // "mail", "team", "senden" overlap
      expect(sim).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ─── T57: createSuggestion (enhanced dedup) ──────────

  describe('createSuggestion (enhanced dedup)', () => {
    it('creates a new suggestion when no duplicates exist', async () => {
      // Exact dedup check
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Fuzzy dedup check
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Insert
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDbRow({ id: 'new-id', priority: '70' })],
      });
      // Enforce max limit (count)
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: '3' }] });

      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'New Task',
        description: 'A new task',
        priority: 70,
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe('new-id');
    });

    it('returns null for exact title duplicate', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'Already Exists',
      });

      expect(result).toBeNull();
      // Only the exact dedup check should have been called
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('merges when fuzzy title match exceeds threshold', async () => {
      // Exact dedup: no match
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      // Fuzzy dedup: finds similar
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDbRow({ id: 'existing-id', title: 'Bericht schicken heute', type: 'task_reminder' })],
      });
      // Merge update
      mockQueryContext.mockResolvedValueOnce({ rows: [makeDbRow({ id: 'existing-id' })] });

      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'Bericht schicken heute dringend',
        description: 'Dringend',
      });

      // Returns null because merge happened
      expect(result).toBeNull();
      // Should have called: exact check, fuzzy check, merge update
      expect(mockQueryContext).toHaveBeenCalledTimes(3);
    });

    it('returns null on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'knowledge_insight' as SuggestionType,
        title: 'Test',
      });
      expect(result).toBeNull();
    });

    it('uses default priority of 50 when not specified', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDbRow({ id: 'new', priority: '50' })],
      });
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: '1' }] });

      await createSuggestion('personal', {
        userId: TEST_USER_ID,
        type: 'task_reminder' as SuggestionType,
        title: 'No Priority',
      });

      // Check the INSERT call (3rd call)
      const insertCall = mockQueryContext.mock.calls[2];
      expect(insertCall[2]).toContain(50); // priority param
    });
  });

  // ─── T57: mergeRelatedSuggestions ────────────────────

  describe('mergeRelatedSuggestions', () => {
    it('merges similar suggestions of the same type', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeDbRow({ id: 'newer', title: 'Bericht schicken morgen', type: 'task_reminder', created_at: '2026-03-20T12:00:00Z' }),
          makeDbRow({ id: 'older', title: 'Bericht schicken heute morgen', type: 'task_reminder', created_at: '2026-03-20T10:00:00Z' }),
        ],
      });
      // Update newer with merged description
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });
      // Dismiss older
      mockQueryContext.mockResolvedValueOnce({ rowCount: 1 });

      const mergeCount = await mergeRelatedSuggestions('personal', TEST_USER_ID);
      expect(mergeCount).toBe(1);
    });

    it('does not merge suggestions of different types', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeDbRow({ id: 'a', title: 'Bericht schicken', type: 'task_reminder' }),
          makeDbRow({ id: 'b', title: 'Bericht schicken', type: 'email_followup' }),
        ],
      });

      const mergeCount = await mergeRelatedSuggestions('personal', TEST_USER_ID);
      expect(mergeCount).toBe(0);
    });

    it('does not merge dissimilar titles', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeDbRow({ id: 'a', title: 'Einkaufen gehen', type: 'task_reminder' }),
          makeDbRow({ id: 'b', title: 'Meeting vorbereiten', type: 'task_reminder' }),
        ],
      });

      const mergeCount = await mergeRelatedSuggestions('personal', TEST_USER_ID);
      expect(mergeCount).toBe(0);
    });

    it('returns 0 on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const mergeCount = await mergeRelatedSuggestions('personal', TEST_USER_ID);
      expect(mergeCount).toBe(0);
    });

    it('handles empty suggestion list', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] });
      const mergeCount = await mergeRelatedSuggestions('personal', TEST_USER_ID);
      expect(mergeCount).toBe(0);
    });
  });

  // ─── T57: enforceMaxActiveSuggestions ────────────────

  describe('enforceMaxActiveSuggestions', () => {
    it('does nothing when under the limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: '5' }] });

      const dismissed = await enforceMaxActiveSuggestions('personal', TEST_USER_ID);
      expect(dismissed).toBe(0);
      // Only the count query should have been called
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });

    it('dismisses excess suggestions when over the limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: '13' }] });
      mockQueryContext.mockResolvedValueOnce({ rowCount: 3, rows: [{ id: 'x' }, { id: 'y' }, { id: 'z' }] });

      const dismissed = await enforceMaxActiveSuggestions('personal', TEST_USER_ID);
      expect(dismissed).toBe(3); // 13 - 10 = 3
    });

    it('passes correct excess count to dismiss query', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: '12' }] });
      mockQueryContext.mockResolvedValueOnce({ rowCount: 2, rows: [] });

      await enforceMaxActiveSuggestions('personal', TEST_USER_ID);

      const dismissCall = mockQueryContext.mock.calls[1];
      expect(dismissCall[2]).toEqual([TEST_USER_ID, 2]); // 12 - 10 = 2
    });

    it('returns 0 on DB error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const result = await enforceMaxActiveSuggestions('personal', TEST_USER_ID);
      expect(result).toBe(0);
    });

    it('does nothing when exactly at the limit', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ cnt: String(MAX_ACTIVE_SUGGESTIONS) }] });

      const dismissed = await enforceMaxActiveSuggestions('personal', TEST_USER_ID);
      expect(dismissed).toBe(0);
      expect(mockQueryContext).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getActiveSuggestions (enhanced with scoring) ────

  describe('getActiveSuggestions (enhanced)', () => {
    it('returns suggestions sorted by relevance score', async () => {
      const now = new Date();
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeDbRow({ id: 'low', type: 'context_switch', priority: '30', created_at: now.toISOString() }),
          makeDbRow({ id: 'high', type: 'contradiction_alert', priority: '90', created_at: now.toISOString() }),
        ],
      });

      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID, 3);
      expect(suggestions.length).toBe(2);
      // contradiction_alert (90) should be first
      expect(suggestions[0].type).toBe('contradiction_alert');
      expect(suggestions[1].type).toBe('context_switch');
    });

    it('attaches relevanceScore to each suggestion', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeDbRow({ type: 'task_reminder' })],
      });

      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID);
      expect(suggestions[0]).toHaveProperty('relevanceScore');
      expect(typeof suggestions[0].relevanceScore).toBe('number');
    });

    it('returns empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));
      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID);
      expect(suggestions).toEqual([]);
    });

    it('respects the limit parameter', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeDbRow({ id: 'a', type: 'contradiction_alert' }),
          makeDbRow({ id: 'b', type: 'meeting_prep' }),
          makeDbRow({ id: 'c', type: 'task_reminder' }),
          makeDbRow({ id: 'd', type: 'context_switch' }),
        ],
      });

      const suggestions = await getActiveSuggestions('personal', TEST_USER_ID, 2);
      expect(suggestions).toHaveLength(2);
    });
  });

  // ─── Original CRUD tests (Phase 69.1) ───────────────

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

  // ─── Constants & Exports ─────────────────────────────

  describe('constants', () => {
    it('exports TYPE_WEIGHTS with all 13 suggestion types', () => {
      expect(Object.keys(TYPE_WEIGHTS)).toHaveLength(13);
      expect(TYPE_WEIGHTS.contradiction_alert).toBe(90);
      expect(TYPE_WEIGHTS.context_switch).toBe(30);
      expect(TYPE_WEIGHTS.knowledge_gap).toBe(65);
      expect(TYPE_WEIGHTS.hypothesis).toBe(55);
    });

    it('exports MAX_ACTIVE_SUGGESTIONS as 10', () => {
      expect(MAX_ACTIVE_SUGGESTIONS).toBe(10);
    });

    it('exports SIMILARITY_THRESHOLD as 0.7', () => {
      expect(SIMILARITY_THRESHOLD).toBe(0.7);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────

  describe('edge cases', () => {
    it('handles suggestion with missing createdAt gracefully', () => {
      const suggestion = makeSuggestion({ createdAt: '' });
      // Should not throw, computeRecencyDecay handles NaN by returning 0.3
      const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('handles unknown suggestion type gracefully in score', () => {
      const suggestion = makeSuggestion({ type: 'unknown_type' as SuggestionType });
      const score = computeRelevanceScore(suggestion, 'personal', TEST_USER_ID);
      // Falls back to 50 base weight
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('computeRecencyDecay handles negative age', () => {
      // Future date = negative age = still within 1h bracket
      const decay = computeRecencyDecay(-1000);
      expect(decay).toBe(1.0);
    });

    it('computeTitleSimilarity handles strings with only short words', () => {
      // All words are 1 char, filtered out
      const sim = computeTitleSimilarity('a b c', 'x y z');
      expect(sim).toBe(1.0); // both sets empty after filtering
    });

    it('multiple rapid activity recordings accumulate correctly', () => {
      for (let i = 0; i < 100; i++) {
        recordUserActivity('personal', TEST_USER_ID, 'accept', 'task_reminder');
      }
      const pattern = getUserActivityPattern('personal', TEST_USER_ID);
      expect(pattern.totalInteractions).toBe(100);
    });
  });
});
