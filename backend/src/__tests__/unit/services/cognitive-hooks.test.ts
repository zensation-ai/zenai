/**
 * Tests for cognitive-hooks.ts — Phase 125-140 post-response hooks
 */

// Mock all dynamic imports BEFORE importing the module under test.
// Each mock simulates the service module that cognitive-hooks.ts imports at runtime.

const mockRecordCoactivation = jest.fn().mockResolvedValue(undefined);
const mockRecordInformationGain = jest.fn().mockResolvedValue(undefined);
const mockComputeInformationGain = jest.fn().mockReturnValue(0.5);
const mockRecordCalibrationData = jest.fn().mockResolvedValue(undefined);
const mockRecordInteraction = jest.fn().mockResolvedValue(undefined);
const mockCreateFeedbackEvent = jest.fn().mockReturnValue({
  id: 'test-id',
  type: 'response_rating',
  source: 'session-1',
  target: 'chat-response',
  value: 0,
  details: {},
  timestamp: new Date(),
});
const mockRecordFeedback = jest.fn().mockResolvedValue(undefined);
const mockPropagateBatch = jest.fn().mockResolvedValue({ updated: 0, iterations: 1 });
const mockApplyHebbianDecayBatch = jest.fn().mockResolvedValue({ decayed: 0 });

jest.mock('../../../services/knowledge-graph/hebbian-dynamics', () => ({
  recordCoactivation: mockRecordCoactivation,
  applyHebbianDecayBatch: mockApplyHebbianDecayBatch,
}));

jest.mock('../../../services/curiosity/information-gain', () => ({
  recordInformationGain: mockRecordInformationGain,
  computeInformationGain: mockComputeInformationGain,
}));

jest.mock('../../../services/metacognition/calibration', () => ({
  recordCalibrationData: mockRecordCalibrationData,
}));

jest.mock('../../../services/metacognition/capability-model', () => ({
  recordInteraction: mockRecordInteraction,
}));

jest.mock('../../../services/feedback/feedback-bus', () => ({
  createFeedbackEvent: mockCreateFeedbackEvent,
  recordFeedback: mockRecordFeedback,
}));

jest.mock('../../../services/knowledge-graph/confidence-propagation', () => ({
  propagateBatch: mockPropagateBatch,
}));

// recall-tracker is NOT used in cognitive-hooks (FSRS tracking needs fact IDs
// which are only available in the memory coordinator, not in post-response hooks)

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { runPostResponseHooks, extractEntityCandidates, PostResponseHookParams } from '../../../services/cognitive-hooks';

describe('cognitive-hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------
  // extractEntityCandidates
  // -------------------------------------------------------------------

  describe('extractEntityCandidates', () => {
    it('should extract words longer than 4 characters', () => {
      const result = extractEntityCandidates('The quick brown foxes jump');
      expect(result).toContain('quick');
      expect(result).toContain('brown');
      expect(result).toContain('foxes');
      expect(result).not.toContain('The');
      expect(result).not.toContain('jump');
    });

    it('should deduplicate case-insensitively', () => {
      const result = extractEntityCandidates('Berlin berlin BERLIN');
      expect(result).toHaveLength(1);
      expect(result[0]).toBe('berlin');
    });

    it('should return empty array for short text', () => {
      const result = extractEntityCandidates('hi ok');
      expect(result).toHaveLength(0);
    });

    it('should cap at 20 entities', () => {
      const longText = Array.from({ length: 50 }, (_, i) => `entity${i}word`).join(' ');
      const result = extractEntityCandidates(longText);
      expect(result.length).toBeLessThanOrEqual(20);
    });

    it('should handle special characters', () => {
      const result = extractEntityCandidates('Hallo! Wie geht es dir heute?');
      expect(result).toContain('hallo');
      expect(result).toContain('heute');
    });
  });

  // -------------------------------------------------------------------
  // runPostResponseHooks — minimal params
  // -------------------------------------------------------------------

  describe('runPostResponseHooks with minimal params', () => {
    const minimal: PostResponseHookParams = {
      context: 'personal',
      query: 'Was ist TypeScript?',
      response: 'TypeScript ist eine typisierte Programmiersprache.',
    };

    it('should never throw', async () => {
      await expect(runPostResponseHooks(minimal)).resolves.toBeUndefined();
    });

    it('should skip Hebbian recordCoactivation (no entity resolution yet)', async () => {
      await runPostResponseHooks(minimal);
      // recordCoactivation is intentionally skipped because extractEntityCandidates
      // returns keywords (strings), not UUID entity IDs that the DB expects.
      expect(mockRecordCoactivation).not.toHaveBeenCalled();
    });

    it('should call recordInformationGain', async () => {
      await runPostResponseHooks(minimal);
      expect(mockRecordInformationGain).toHaveBeenCalledWith(
        'personal',
        expect.objectContaining({
          queryText: expect.any(String),
          surprise: expect.any(Number),
          novelty: expect.any(Number),
          informationGain: expect.any(Number),
        }),
      );
    });

    it('should call recordFeedback via feedback bus', async () => {
      await runPostResponseHooks(minimal);
      expect(mockCreateFeedbackEvent).toHaveBeenCalledWith(
        'response_rating',
        expect.any(String),
        'chat-response',
        expect.any(Number),
        expect.objectContaining({
          queryLength: minimal.query.length,
          responseLength: minimal.response.length,
        }),
      );
      expect(mockRecordFeedback).toHaveBeenCalled();
    });

    it('should NOT call recordCalibrationData when confidence is undefined', async () => {
      await runPostResponseHooks(minimal);
      expect(mockRecordCalibrationData).not.toHaveBeenCalled();
    });

    it('should NOT call recordInteraction when domain is undefined', async () => {
      await runPostResponseHooks(minimal);
      expect(mockRecordInteraction).not.toHaveBeenCalled();
    });

    it('should not call Hebbian decay on most requests (probabilistic)', async () => {
      // Hebbian decay only runs ~5% of the time, so with a single call it likely won't run
      // This test verifies no error is thrown regardless
      await expect(runPostResponseHooks(minimal)).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------
  // runPostResponseHooks — full params
  // -------------------------------------------------------------------

  describe('runPostResponseHooks with full params', () => {
    const full: PostResponseHookParams = {
      context: 'work',
      userId: 'user-123',
      query: 'Explain machine learning algorithms',
      response: 'Machine learning algorithms are computational methods that learn from data.',
      domain: 'technology',
      confidence: 0.85,
      toolsUsed: ['web_search', 'recall'],
      sessionId: 'session-abc',
    };

    it('should never throw', async () => {
      await expect(runPostResponseHooks(full)).resolves.toBeUndefined();
    });

    it('should call recordCalibrationData when confidence is provided', async () => {
      await runPostResponseHooks(full);
      expect(mockRecordCalibrationData).toHaveBeenCalledWith('work', 0.85, true);
    });

    it('should call recordInteraction when domain is provided', async () => {
      await runPostResponseHooks(full);
      expect(mockRecordInteraction).toHaveBeenCalledWith('work', 'technology', true);
    });

    it('should handle userId param without error', async () => {
      await expect(runPostResponseHooks(full)).resolves.toBeUndefined();
    });

    it('should pass higher novelty when toolsUsed is non-empty', async () => {
      await runPostResponseHooks(full);
      // Information gain should have been called with novelty=0.6 when tools are used
      const call = mockRecordInformationGain.mock.calls[0];
      expect(call[1].novelty).toBe(0.6);
    });

    it('should pass lower novelty when toolsUsed is empty', async () => {
      await runPostResponseHooks({ ...full, toolsUsed: [] });
      const call = mockRecordInformationGain.mock.calls[0];
      expect(call[1].novelty).toBe(0.3);
    });
  });

  // -------------------------------------------------------------------
  // Error isolation
  // -------------------------------------------------------------------

  describe('error isolation', () => {
    it('should not throw when Hebbian service throws', async () => {
      mockRecordCoactivation.mockRejectedValueOnce(new Error('DB down'));
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'hello world testing',
        response: 'response text with enough words',
      })).resolves.toBeUndefined();
    });

    it('should not throw when information gain throws', async () => {
      mockRecordInformationGain.mockRejectedValueOnce(new Error('fail'));
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'test query here',
        response: 'test response text',
      })).resolves.toBeUndefined();
    });

    it('should not throw when calibration throws', async () => {
      mockRecordCalibrationData.mockRejectedValueOnce(new Error('fail'));
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'test query here',
        response: 'test response text',
        confidence: 0.9,
      })).resolves.toBeUndefined();
    });

    it('should not throw when capability model throws', async () => {
      mockRecordInteraction.mockRejectedValueOnce(new Error('fail'));
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'test query here',
        response: 'test response text',
        domain: 'tech',
      })).resolves.toBeUndefined();
    });

    it('should not throw when feedback bus throws', async () => {
      mockRecordFeedback.mockRejectedValueOnce(new Error('fail'));
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'test query here',
        response: 'test response text',
      })).resolves.toBeUndefined();
    });

    it('should still call other hooks when one fails', async () => {
      mockRecordCoactivation.mockRejectedValueOnce(new Error('fail'));
      await runPostResponseHooks({
        context: 'personal',
        query: 'hello world testing',
        response: 'response text testing here',
        confidence: 0.8,
        domain: 'tech',
      });

      // Other hooks should still have been called
      expect(mockRecordInformationGain).toHaveBeenCalled();
      expect(mockRecordCalibrationData).toHaveBeenCalled();
      expect(mockRecordInteraction).toHaveBeenCalled();
      expect(mockRecordFeedback).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle empty query gracefully', async () => {
      await expect(runPostResponseHooks({
        context: 'personal',
        query: '',
        response: 'some response text here',
      })).resolves.toBeUndefined();
    });

    it('should handle empty response gracefully', async () => {
      await expect(runPostResponseHooks({
        context: 'personal',
        query: 'some query text here',
        response: '',
      })).resolves.toBeUndefined();
    });

    it('should skip Hebbian when fewer than 2 entities extracted', async () => {
      await runPostResponseHooks({
        context: 'personal',
        query: 'hi',
        response: 'hey',
      });
      // With "hi" and "hey" (both <= 4 chars), no entities are extracted
      expect(mockRecordCoactivation).not.toHaveBeenCalled();
    });

    it('should truncate query for information gain to 500 chars', async () => {
      const longQuery = 'a'.repeat(1000);
      await runPostResponseHooks({
        context: 'personal',
        query: longQuery,
        response: 'response text here testing',
      });
      const call = mockRecordInformationGain.mock.calls[0];
      expect(call[1].queryText.length).toBeLessThanOrEqual(500);
    });
  });
});
