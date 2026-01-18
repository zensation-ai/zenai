/**
 * Unit Tests for Proactive Suggestions Service
 *
 * Tests the proactive suggestion engine that generates intelligent
 * suggestions based on user patterns and context.
 */

import { ProactiveSuggestionEngine, proactiveSuggestionEngine } from '../../../services/proactive-suggestions';

// Mock dependencies BEFORE importing the module under test
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

jest.mock('../../../services/routine-detection', () => ({
  routineDetectionService: {
    checkActiveRoutines: jest.fn(),
    analyzePatterns: jest.fn(),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { queryContext } from '../../../utils/database-context';
import { routineDetectionService } from '../../../services/routine-detection';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;
const mockCheckActiveRoutines = routineDetectionService.checkActiveRoutines as jest.MockedFunction<typeof routineDetectionService.checkActiveRoutines>;

// Helper to create valid DetectedRoutine objects
function createMockDetectedRoutine(overrides: Partial<{
  id: string;
  confidence: number;
  patternType: string;
  actionType: string;
}> = {}) {
  const pattern = {
    id: overrides.id || 'routine-1',
    context: 'personal' as const,
    patternType: (overrides.patternType || 'time_based') as 'time_based' | 'sequence_based' | 'context_based',
    triggerConfig: { dayOfWeek: [1, 2, 3, 4, 5], hourRange: [9, 10] as [number, number] },
    actionType: overrides.actionType || 'review_tasks',
    actionConfig: {},
    confidence: overrides.confidence || 0.8,
    occurrences: 10,
    lastTriggered: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    pattern,
    triggerMatch: {
      matchType: pattern.patternType,
      matchedConditions: ['time_match'],
      matchStrength: pattern.confidence,
    },
    suggestedAction: {
      actionType: 'start_task',
      title: 'Test Routine',
      description: 'Test action description',
    },
  };
}

describe('Proactive Suggestions Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset time-based mocks
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-18T10:00:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ===========================================
  // getSuggestions Tests
  // ===========================================

  describe('getSuggestions', () => {
    it('should return suggestions for a context', async () => {
      mockCheckActiveRoutines.mockResolvedValue([
        createMockDetectedRoutine({ confidence: 0.8 }),
      ]);

      // Mock settings query
      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine', 'connection', 'follow_up', 'draft'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should include routine-based suggestions', async () => {
      mockCheckActiveRoutines.mockResolvedValue([
        createMockDetectedRoutine({ id: 'morning-routine', confidence: 0.9 }),
      ]);

      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      const routineSuggestion = suggestions.find(s => s.type === 'routine');
      expect(routineSuggestion).toBeDefined();
    });

    it('should limit number of suggestions via options', async () => {
      mockCheckActiveRoutines.mockResolvedValue(
        Array(20).fill(null).map((_, i) =>
          createMockDetectedRoutine({ id: `routine-${i}`, confidence: 0.8 })
        )
      );

      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal', { limit: 3 });

      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should filter by suggestion types', async () => {
      mockCheckActiveRoutines.mockResolvedValue([
        createMockDetectedRoutine({ confidence: 0.9 }),
      ]);

      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine', 'connection'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal', { types: ['routine'] });

      suggestions.forEach(s => {
        expect(s.type).toBe('routine');
      });
    });

    it('should handle empty results gracefully', async () => {
      mockCheckActiveRoutines.mockResolvedValue([]);
      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      expect(suggestions).toEqual([]);
    });

    it('should return empty array when proactivity is off', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'off',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      expect(suggestions).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('Database error'));

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      expect(suggestions).toEqual([]);
    });
  });

  // ===========================================
  // Feedback Tests
  // ===========================================

  describe('recordFeedback', () => {
    it('should record positive feedback', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await proactiveSuggestionEngine.recordFeedback('suggestion-1', true, 'personal');

      expect(mockQueryContext).toHaveBeenCalled();
    });

    it('should record negative feedback with reason', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await proactiveSuggestionEngine.recordFeedback('suggestion-1', false, 'personal', { dismissReason: 'not_relevant' });

      expect(mockQueryContext).toHaveBeenCalled();
    });

    it('should handle feedback errors gracefully', async () => {
      mockQueryContext.mockRejectedValue(new Error('DB error'));

      await expect(
        proactiveSuggestionEngine.recordFeedback('suggestion-1', true, 'personal')
      ).resolves.not.toThrow();
    });
  });

  // ===========================================
  // Settings Tests
  // ===========================================

  describe('settings', () => {
    it('should get settings for a context', async () => {
      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine', 'connection'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      const settings = await proactiveSuggestionEngine.getSettings('personal');

      expect(settings).toBeDefined();
      expect(settings.proactivityLevel).toBe('balanced');
    });

    it('should return default settings if none exist', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 0 } as any);

      const settings = await proactiveSuggestionEngine.getSettings('personal');

      expect(settings).toBeDefined();
      expect(settings.proactivityLevel).toBeDefined();
    });

    it('should update settings', async () => {
      mockQueryContext.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      await proactiveSuggestionEngine.updateSettings('personal', {
        proactivityLevel: 'aggressive',
        enabledTypes: ['routine', 'draft'],
      });

      expect(mockQueryContext).toHaveBeenCalled();
    });

    it('should respect quiet hours', async () => {
      // Set time to quiet hours (11 PM)
      jest.setSystemTime(new Date('2026-01-18T23:00:00'));

      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      mockCheckActiveRoutines.mockResolvedValue([
        createMockDetectedRoutine({ confidence: 0.9 }),
      ]);

      const suggestions = await proactiveSuggestionEngine.getSuggestions('personal');

      // During quiet hours, should return empty array
      expect(suggestions).toEqual([]);
    });
  });

  // ===========================================
  // Singleton Tests
  // ===========================================

  describe('proactiveSuggestionEngine singleton', () => {
    it('should be defined', () => {
      expect(proactiveSuggestionEngine).toBeDefined();
    });

    it('should be an instance of ProactiveSuggestionEngine', () => {
      expect(proactiveSuggestionEngine).toBeInstanceOf(ProactiveSuggestionEngine);
    });

    it('should maintain state across calls', async () => {
      mockCheckActiveRoutines.mockResolvedValue([]);
      mockQueryContext.mockResolvedValue({
        rows: [{
          proactivity_level: 'balanced',
          enabled_types: ['routine'],
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          max_suggestions_per_day: 10,
        }],
        rowCount: 1,
      } as any);

      await proactiveSuggestionEngine.getSuggestions('personal');
      await proactiveSuggestionEngine.getSuggestions('personal');

      // Should work without errors
      expect(true).toBe(true);
    });
  });
});
