/**
 * Unit Tests for Routine Detection Service
 *
 * Tests pattern analysis, active routine checking, learning from actions,
 * confidence decay, pattern management, and helper conversions.
 *
 * @module tests/unit/services/routine-detection
 */

const mockQueryContext = jest.fn();
jest.mock('../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-001'),
}));

import { routineDetectionService } from '../../../services/routine-detection';

// ===========================================
// Test Helpers
// ===========================================

const makePatternRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'pattern-001',
  context: 'operations',
  pattern_type: 'time_based',
  trigger_config: JSON.stringify({ dayOfWeek: [1], hourRange: [9, 10] }),
  action_type: 'idea_created',
  action_config: JSON.stringify({}),
  confidence: '0.8',
  occurrences: '5',
  last_triggered: null,
  is_active: true,
  created_at: '2026-03-20T10:00:00Z',
  updated_at: '2026-03-20T10:00:00Z',
  ...overrides,
});

const makeTimePatternQueryRow = (overrides: Record<string, unknown> = {}) => ({
  action_type: 'idea_created',
  day_of_week: 1,
  hour_of_day: 9,
  occurrence_count: 5,
  ...overrides,
});

const makeSequenceQueryRow = (overrides: Record<string, unknown> = {}) => ({
  first_action: 'meeting_created',
  second_action: 'draft_generated',
  sequence_count: 4,
  ...overrides,
});

const makeContextQueryRow = (overrides: Record<string, unknown> = {}) => ({
  category: 'business',
  type: 'task',
  action_type: 'export_created',
  occurrence_count: 6,
  ...overrides,
});

describe('Routine Detection Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQueryContext.mockReset();
  });

  // ===========================================
  // analyzeUserPatterns
  // ===========================================

  describe('analyzeUserPatterns', () => {
    it('should analyze all three pattern types and return combined results', async () => {
      // Time-based query returns 1 row
      mockQueryContext.mockResolvedValueOnce({ rows: [makeTimePatternQueryRow()] } as any);
      // getExistingPattern for time pattern -> not found
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // createPattern INSERT for time pattern
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // Sequence-based query returns 1 row
      mockQueryContext.mockResolvedValueOnce({ rows: [makeSequenceQueryRow()] } as any);
      // createPattern INSERT for sequence pattern
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // Context-based query returns 1 row
      mockQueryContext.mockResolvedValueOnce({ rows: [makeContextQueryRow()] } as any);
      // createPattern INSERT for context pattern
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const patterns = await routineDetectionService.analyzeUserPatterns('operations', 30);

      expect(patterns).toHaveLength(3);
      expect(patterns[0].patternType).toBe('time_based');
      expect(patterns[1].patternType).toBe('sequence_based');
      expect(patterns[2].patternType).toBe('context_based');
    });

    it('should return empty array on total failure', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB down'));

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns).toEqual([]);
    });

    it('should use default 30 days when not specified', async () => {
      // Time query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Sequence query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // Context query
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.analyzeUserPatterns('operations');

      expect(mockQueryContext.mock.calls[0][2]).toContain(30);
    });

    it('should update existing pattern instead of creating new one', async () => {
      const existingRow = makePatternRow({ id: 'existing-001', confidence: '0.6' });

      // Time-based query returns 1 row
      mockQueryContext.mockResolvedValueOnce({ rows: [makeTimePatternQueryRow()] } as any);
      // getExistingPattern -> found
      mockQueryContext.mockResolvedValueOnce({ rows: [existingRow] } as any);
      // updatePatternConfidence
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      // Sequence + Context return empty
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns).toHaveLength(1);
      expect(patterns[0].id).toBe('existing-001');
    });

    it('should continue analyzing other patterns if one type fails', async () => {
      // Time-based fails
      mockQueryContext.mockRejectedValueOnce(new Error('time query failed'));
      // Sequence returns data
      mockQueryContext.mockResolvedValueOnce({ rows: [makeSequenceQueryRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // createPattern
      // Context returns data
      mockQueryContext.mockResolvedValueOnce({ rows: [makeContextQueryRow()] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // createPattern

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns).toHaveLength(2);
    });

    it('should calculate confidence correctly for time patterns', async () => {
      // occurrence_count = 10 -> confidence = min(0.5 + (10/10)*0.5, 1.0) = 1.0
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeTimePatternQueryRow({ occurrence_count: 10 })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // no existing
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // create

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // sequence
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // context

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns[0].confidence).toBe(1.0);
    });

    it('should cap confidence at 1.0 for high occurrence counts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeTimePatternQueryRow({ occurrence_count: 100 })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns[0].confidence).toBeLessThanOrEqual(1.0);
    });

    it('should cap sequence confidence at 0.95', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // time
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeSequenceQueryRow({ sequence_count: 100 })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // create
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // context

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns[0].confidence).toBeLessThanOrEqual(0.95);
    });

    it('should cap context confidence at 0.9', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // time
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // sequence
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeContextQueryRow({ occurrence_count: 100 })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // create

      const patterns = await routineDetectionService.analyzeUserPatterns('operations');

      expect(patterns[0].confidence).toBeLessThanOrEqual(0.9);
    });
  });

  // ===========================================
  // checkActiveRoutines
  // ===========================================

  describe('checkActiveRoutines', () => {
    it('should detect active time-based routine matching current time', async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const hour = now.getHours();

      const row = makePatternRow({
        trigger_config: JSON.stringify({
          dayOfWeek: [dayOfWeek],
          hourRange: [hour, hour + 1],
        }),
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines.length).toBeGreaterThanOrEqual(1);
      if (routines.length > 0) {
        expect(routines[0].triggerMatch.matchType).toBe('time_based');
        expect(routines[0].suggestedAction).toBeDefined();
      }
    });

    it('should skip patterns triggered within last 4 hours', async () => {
      const now = new Date();
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const dayOfWeek = now.getDay();
      const hour = now.getHours();

      const row = makePatternRow({
        trigger_config: JSON.stringify({
          dayOfWeek: [dayOfWeek],
          hourRange: [hour, hour + 1],
        }),
        confidence: '0.8',
        last_triggered: twoHoursAgo.toISOString(),
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toHaveLength(0);
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toEqual([]);
    });

    it('should return empty when no active patterns exist', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toEqual([]);
    });

    it('should detect sequence-based patterns', async () => {
      const row = makePatternRow({
        pattern_type: 'sequence_based',
        trigger_config: JSON.stringify({ afterAction: 'meeting_created' }),
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toHaveLength(1);
      expect(routines[0].triggerMatch.matchType).toBe('sequence_based');
      expect(routines[0].triggerMatch.matchedConditions).toContain('after:meeting_created');
    });

    it('should detect context-based patterns with category and type', async () => {
      const row = makePatternRow({
        pattern_type: 'context_based',
        trigger_config: JSON.stringify({ ideaCategory: 'business', ideaType: 'task' }),
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toHaveLength(1);
      expect(routines[0].triggerMatch.matchedConditions).toContain('category:business');
      expect(routines[0].triggerMatch.matchedConditions).toContain('type:task');
    });

    it('should not trigger time-based pattern on wrong day', async () => {
      const now = new Date();
      const wrongDay = (now.getDay() + 3) % 7;

      const row = makePatternRow({
        trigger_config: JSON.stringify({
          dayOfWeek: [wrongDay],
          hourRange: [now.getHours(), now.getHours() + 1],
        }),
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toHaveLength(0);
    });

    it('should not trigger time-based pattern outside hour range', async () => {
      const now = new Date();
      const currentHour = now.getHours();
      // Use an hour range far from current (accounting for tolerance of 1)
      const farHour = (currentHour + 12) % 24;

      const row = makePatternRow({
        trigger_config: JSON.stringify({
          dayOfWeek: [now.getDay()],
          hourRange: [farHour, farHour + 1],
        }),
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines).toHaveLength(0);
    });

    it('should allow old triggered patterns (>4 hours ago)', async () => {
      const now = new Date();
      const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      const dayOfWeek = now.getDay();
      const hour = now.getHours();

      const row = makePatternRow({
        trigger_config: JSON.stringify({
          dayOfWeek: [dayOfWeek],
          hourRange: [hour, hour + 1],
        }),
        confidence: '0.8',
        last_triggered: fiveHoursAgo.toISOString(),
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================
  // buildSuggestedAction (tested via checkActiveRoutines)
  // ===========================================

  describe('buildSuggestedAction', () => {
    it('should return mapped action for known action types', async () => {
      const now = new Date();
      const row = makePatternRow({
        pattern_type: 'sequence_based',
        trigger_config: JSON.stringify({ afterAction: 'something' }),
        action_type: 'meeting_created',
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines[0].suggestedAction.actionType).toBe('create_meeting');
      expect(routines[0].suggestedAction.title).toBe('Meeting planen');
    });

    it('should return fallback action for unknown action types', async () => {
      const row = makePatternRow({
        pattern_type: 'sequence_based',
        trigger_config: JSON.stringify({ afterAction: 'something' }),
        action_type: 'unknown_action',
        confidence: '0.8',
        last_triggered: null,
      });

      mockQueryContext.mockResolvedValueOnce({ rows: [row] } as any);

      const routines = await routineDetectionService.checkActiveRoutines('operations');

      expect(routines[0].suggestedAction.actionType).toBe('unknown_action');
      expect(routines[0].suggestedAction.title).toContain('unknown_action');
      expect(routines[0].suggestedAction.description).toContain('80%');
    });
  });

  // ===========================================
  // learnFromAction
  // ===========================================

  describe('learnFromAction', () => {
    it('should log action and check for sequences', async () => {
      // INSERT action log
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // checkSequenceCompletion: find matching patterns
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // updateRelatedPatterns
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.learnFromAction('operations', {
        actionType: 'idea_created',
        actionData: { ideaId: '123' },
      });

      expect(mockQueryContext).toHaveBeenCalledTimes(3);
      expect(mockQueryContext.mock.calls[0][1]).toContain('INSERT INTO user_action_log');
    });

    it('should use provided timestamp', async () => {
      const customTimestamp = new Date('2026-01-15T10:00:00Z');

      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.learnFromAction('operations', {
        actionType: 'idea_created',
        actionData: {},
        timestamp: customTimestamp,
      });

      expect(mockQueryContext.mock.calls[0][2][3]).toEqual(customTimestamp);
    });

    it('should use current date when no timestamp provided', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const before = new Date();
      await routineDetectionService.learnFromAction('operations', {
        actionType: 'idea_created',
        actionData: {},
      });
      const after = new Date();

      const usedTimestamp = mockQueryContext.mock.calls[0][2][3] as Date;
      expect(usedTimestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(usedTimestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should not throw on error', async () => {
      mockQueryContext.mockRejectedValue(new Error('Insert failed'));

      await expect(
        routineDetectionService.learnFromAction('operations', {
          actionType: 'idea_created',
          actionData: {},
        })
      ).resolves.toBeUndefined();
    });

    it('should increase confidence when sequence is completed', async () => {
      // INSERT action log
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // checkSequenceCompletion: find matching sequence pattern
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'seq-001',
          trigger_config: JSON.stringify({ afterAction: 'meeting_created' }),
          confidence: 0.6,
          occurrences: 3,
        }],
      } as any);
      // Check if "before" action happened recently -> yes
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'action-001' }] } as any);
      // UPDATE confidence
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // updateRelatedPatterns
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.learnFromAction('operations', {
        actionType: 'draft_generated',
        actionData: {},
      });

      // The UPDATE call should increase confidence by 0.1
      const updateCall = mockQueryContext.mock.calls[3];
      expect(updateCall[1]).toContain('UPDATE routine_patterns');
      expect(updateCall[2][1]).toBeCloseTo(0.7); // 0.6 + 0.1
    });

    it('should not increase confidence when no recent preceding action', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'seq-001',
          trigger_config: JSON.stringify({ afterAction: 'meeting_created' }),
          confidence: 0.6,
          occurrences: 3,
        }],
      } as any);
      // No recent preceding action
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // updateRelatedPatterns
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.learnFromAction('operations', {
        actionType: 'draft_generated',
        actionData: {},
      });

      // Should be 4 calls total (no UPDATE for confidence)
      expect(mockQueryContext).toHaveBeenCalledTimes(4);
    });

    it('should handle trigger_config as object (not string)', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'seq-001',
          trigger_config: { afterAction: 'meeting_created' }, // already parsed
          confidence: 0.5,
          occurrences: 2,
        }],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [{ id: 'x' }] } as any); // recent action
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // UPDATE
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // updateRelated

      await expect(
        routineDetectionService.learnFromAction('operations', {
          actionType: 'draft_generated',
          actionData: {},
        })
      ).resolves.toBeUndefined();
    });
  });

  // ===========================================
  // applyConfidenceDecay
  // ===========================================

  describe('applyConfidenceDecay', () => {
    it('should return count of decayed patterns', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }],
      } as any);

      const count = await routineDetectionService.applyConfidenceDecay('operations');

      expect(count).toBe(3);
    });

    it('should return 0 when no patterns need decay', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const count = await routineDetectionService.applyConfidenceDecay('operations');

      expect(count).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const count = await routineDetectionService.applyConfidenceDecay('operations');

      expect(count).toBe(0);
    });

    it('should apply weekly decay factor', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.applyConfidenceDecay('finance');

      const params = mockQueryContext.mock.calls[0][2];
      // CONFIG.CONFIDENCE_DECAY_PER_DAY * 7 = 0.02 * 7 = 0.14
      expect(params[1]).toBeCloseTo(0.14);
    });
  });

  // ===========================================
  // getPatterns
  // ===========================================

  describe('getPatterns', () => {
    it('should return all active patterns by default', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makePatternRow({ id: 'p1' }),
          makePatternRow({ id: 'p2', confidence: '0.6' }),
        ],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns).toHaveLength(2);
      expect(patterns[0].id).toBe('p1');
      expect(patterns[0].confidence).toBe(0.8);
    });

    it('should include inactive patterns when activeOnly is false', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ is_active: false })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations', { activeOnly: false });

      expect(patterns).toHaveLength(1);
      // Verify the query does NOT contain "is_active = true"
      const query = mockQueryContext.mock.calls[0][1] as string;
      expect(query).not.toContain('is_active = true');
    });

    it('should filter by minConfidence', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await routineDetectionService.getPatterns('operations', { minConfidence: 0.7 });

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[1]).toBe(0.7);
    });

    it('should return empty array on error', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('DB error'));

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns).toEqual([]);
    });

    it('should parse string confidence and occurrences from DB rows', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ confidence: '0.75', occurrences: '12' })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(typeof patterns[0].confidence).toBe('number');
      expect(patterns[0].confidence).toBe(0.75);
      expect(typeof patterns[0].occurrences).toBe('number');
      expect(patterns[0].occurrences).toBe(12);
    });

    it('should handle numeric confidence and occurrences from DB rows', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ confidence: 0.9, occurrences: 7 })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns[0].confidence).toBe(0.9);
      expect(patterns[0].occurrences).toBe(7);
    });

    it('should handle null action_config', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ action_config: null })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns[0].actionConfig).toEqual({});
    });

    it('should parse trigger_config when it is an object already', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ trigger_config: { dayOfWeek: [1], hourRange: [9, 10] } })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns[0].triggerConfig).toEqual({ dayOfWeek: [1], hourRange: [9, 10] });
    });

    it('should convert lastTriggered to Date when present', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ last_triggered: '2026-03-20T15:00:00Z' })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns[0].lastTriggered).toBeInstanceOf(Date);
    });

    it('should set lastTriggered to null when not present', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makePatternRow({ last_triggered: null })],
      } as any);

      const patterns = await routineDetectionService.getPatterns('operations');

      expect(patterns[0].lastTriggered).toBeNull();
    });
  });
});
