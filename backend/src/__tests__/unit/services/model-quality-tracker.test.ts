/**
 * Tests for Model Quality Tracker
 * @module tests/unit/services/model-quality-tracker
 */

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  recordModelPerformance,
  getModelScore,
  computeRoutingScore,
  getAllMetrics,
  resetMetrics,
} from '../../../services/model-quality-tracker';

describe('Model Quality Tracker', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('recordModelPerformance', () => {
    it('should track metrics for a model', () => {
      recordModelPerformance('claude-sonnet', 'standard_query', 0.9, 500, true);

      const score = getModelScore('claude-sonnet', 'standard_query');
      expect(score).not.toBeNull();
      expect(score!.avgQuality).toBe(0.9);
      expect(score!.avgLatencyMs).toBe(500);
      expect(score!.errorRate).toBe(0);
      expect(score!.sampleSize).toBe(1);
    });

    it('should accumulate multiple recordings', () => {
      recordModelPerformance('claude-sonnet', 'standard_query', 0.8, 400, true);
      recordModelPerformance('claude-sonnet', 'standard_query', 1.0, 600, true);

      const score = getModelScore('claude-sonnet', 'standard_query');
      expect(score!.avgQuality).toBeCloseTo(0.9);
      expect(score!.avgLatencyMs).toBe(500);
      expect(score!.sampleSize).toBe(2);
    });

    it('should track errors separately', () => {
      recordModelPerformance('mistral', 'simple_query', 0.5, 200, true);
      recordModelPerformance('mistral', 'simple_query', 0, 100, false);

      const score = getModelScore('mistral', 'simple_query');
      expect(score!.errorRate).toBe(0.5);
      expect(score!.sampleSize).toBe(2);
    });

    it('should track different task types independently', () => {
      recordModelPerformance('claude', 'simple', 0.7, 100, true);
      recordModelPerformance('claude', 'complex', 0.95, 2000, true);

      const simple = getModelScore('claude', 'simple');
      const complex = getModelScore('claude', 'complex');

      expect(simple!.avgQuality).toBe(0.7);
      expect(complex!.avgQuality).toBe(0.95);
    });
  });

  describe('getModelScore', () => {
    it('should return null for untested model', () => {
      const score = getModelScore('nonexistent-model', 'any_task');
      expect(score).toBeNull();
    });

    it('should return averages correctly', () => {
      recordModelPerformance('model-a', 'task', 0.6, 300, true);
      recordModelPerformance('model-a', 'task', 0.8, 500, true);
      recordModelPerformance('model-a', 'task', 1.0, 700, false);

      const score = getModelScore('model-a', 'task');
      expect(score!.avgQuality).toBeCloseTo(0.8);
      expect(score!.avgLatencyMs).toBe(500);
      expect(score!.errorRate).toBeCloseTo(0.333, 2);
      expect(score!.sampleSize).toBe(3);
    });
  });

  describe('computeRoutingScore', () => {
    it('should return 0.5 for untested models', () => {
      const score = computeRoutingScore('new-model', 'task', 0.003, 0.075);
      expect(score).toBe(0.5);
    });

    it('should return 0.5 for models with fewer than 3 samples', () => {
      recordModelPerformance('model', 'task', 0.9, 200, true);
      recordModelPerformance('model', 'task', 0.8, 300, true);

      const score = computeRoutingScore('model', 'task', 0.003, 0.075);
      expect(score).toBe(0.5);
    });

    it('should favor high quality models', () => {
      // High quality model
      for (let i = 0; i < 5; i++) {
        recordModelPerformance('high-quality', 'task', 0.95, 500, true);
      }

      // Low quality model
      for (let i = 0; i < 5; i++) {
        recordModelPerformance('low-quality', 'task', 0.3, 500, true);
      }

      const highScore = computeRoutingScore('high-quality', 'task', 0.003, 0.075);
      const lowScore = computeRoutingScore('low-quality', 'task', 0.003, 0.075);

      expect(highScore).toBeGreaterThan(lowScore);
    });

    it('should penalize expensive models', () => {
      for (let i = 0; i < 5; i++) {
        recordModelPerformance('cheap', 'task', 0.8, 500, true);
        recordModelPerformance('expensive', 'task', 0.8, 500, true);
      }

      const cheapScore = computeRoutingScore('cheap', 'task', 0.001, 0.075);
      const expensiveScore = computeRoutingScore('expensive', 'task', 0.075, 0.075);

      expect(cheapScore).toBeGreaterThan(expensiveScore);
    });

    it('should penalize slow models', () => {
      for (let i = 0; i < 5; i++) {
        recordModelPerformance('fast', 'task', 0.8, 200, true);
        recordModelPerformance('slow', 'task', 0.8, 8000, true);
      }

      const fastScore = computeRoutingScore('fast', 'task', 0.003, 0.075);
      const slowScore = computeRoutingScore('slow', 'task', 0.003, 0.075);

      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it('should penalize unreliable models', () => {
      for (let i = 0; i < 5; i++) {
        recordModelPerformance('reliable', 'task', 0.8, 500, true);
      }
      for (let i = 0; i < 3; i++) {
        recordModelPerformance('unreliable', 'task', 0.8, 500, true);
      }
      for (let i = 0; i < 2; i++) {
        recordModelPerformance('unreliable', 'task', 0, 500, false);
      }

      const reliableScore = computeRoutingScore('reliable', 'task', 0.003, 0.075);
      const unreliableScore = computeRoutingScore('unreliable', 'task', 0.003, 0.075);

      expect(reliableScore).toBeGreaterThan(unreliableScore);
    });
  });

  describe('getAllMetrics', () => {
    it('should return all tracked models', () => {
      recordModelPerformance('model-a', 'task-1', 0.9, 500, true);
      recordModelPerformance('model-b', 'task-2', 0.7, 300, true);

      const all = getAllMetrics();
      expect(all).toHaveLength(2);

      const modelA = all.find(m => m.modelId === 'model-a');
      expect(modelA).toBeDefined();
      expect(modelA!.taskType).toBe('task-1');
      expect(modelA!.avgQuality).toBe(0.9);

      const modelB = all.find(m => m.modelId === 'model-b');
      expect(modelB).toBeDefined();
      expect(modelB!.taskType).toBe('task-2');
    });

    it('should return empty array when no metrics', () => {
      const all = getAllMetrics();
      expect(all).toEqual([]);
    });

    it('should handle models with colons in task type', () => {
      recordModelPerformance('model-a', 'complex:synthesis', 0.9, 500, true);

      const all = getAllMetrics();
      expect(all).toHaveLength(1);
      expect(all[0].modelId).toBe('model-a');
      expect(all[0].taskType).toBe('complex:synthesis');
    });
  });

  describe('resetMetrics', () => {
    it('should clear all data', () => {
      recordModelPerformance('model-a', 'task', 0.9, 500, true);
      recordModelPerformance('model-b', 'task', 0.7, 300, true);

      expect(getAllMetrics()).toHaveLength(2);

      resetMetrics();

      expect(getAllMetrics()).toHaveLength(0);
      expect(getModelScore('model-a', 'task')).toBeNull();
    });
  });
});
