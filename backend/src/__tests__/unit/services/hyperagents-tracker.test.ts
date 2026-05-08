/**
 * HyperAgent Improvement Tracker Tests
 */

import {
  recordImprovement,
  measureOutcome,
  markReverted,
  getMetaMetrics,
  getImprovementHistory,
  getImprovementById,
  _resetForTesting,
} from '../../../services/hyperagents/improvement-tracker';

describe('HyperAgent Improvement Tracker', () => {
  beforeEach(() => {
    _resetForTesting();
  });

  describe('recordImprovement', () => {
    it('creates a record and returns an id', () => {
      const id = recordImprovement({
        level: 0,
        type: 'rag_threshold',
        description: 'Adjust RAG confidence threshold',
        appliedAt: new Date(),
        configBefore: { 'rag.threshold': 0.5 },
        configAfter: { 'rag.threshold': 0.6 },
        qualityBefore: 0.75,
      });

      expect(id).toMatch(/^hyp-/);
    });

    it('sets qualityAfter to null initially', () => {
      const id = recordImprovement({
        level: 0,
        type: 'test',
        description: 'Test',
        appliedAt: new Date(),
        configBefore: {},
        configAfter: {},
        qualityBefore: 0.5,
      });

      const record = getImprovementById(id);
      expect(record).toBeDefined();
      expect(record!.qualityAfter).toBeNull();
      expect(record!.reverted).toBe(false);
      expect(record!.measuredAt).toBeNull();
    });
  });

  describe('measureOutcome', () => {
    it('updates qualityAfter and measuredAt', () => {
      const id = recordImprovement({
        level: 0,
        type: 'test',
        description: 'Test',
        appliedAt: new Date(),
        configBefore: {},
        configAfter: {},
        qualityBefore: 0.5,
      });

      measureOutcome(id, 0.65);

      const record = getImprovementById(id);
      expect(record!.qualityAfter).toBe(0.65);
      expect(record!.measuredAt).toBeInstanceOf(Date);
    });

    it('ignores non-existent id', () => {
      // Should not throw
      measureOutcome('nonexistent', 0.5);
    });
  });

  describe('markReverted', () => {
    it('sets reverted flag to true', () => {
      const id = recordImprovement({
        level: 0,
        type: 'test',
        description: 'Test',
        appliedAt: new Date(),
        configBefore: {},
        configAfter: {},
        qualityBefore: 0.5,
      });

      markReverted(id);

      const record = getImprovementById(id);
      expect(record!.reverted).toBe(true);
    });

    it('ignores non-existent id', () => {
      // Should not throw
      markReverted('nonexistent');
    });
  });

  describe('getMetaMetrics', () => {
    it('returns zero metrics when empty', () => {
      const metrics = getMetaMetrics();
      expect(metrics.successRate).toBe(0);
      expect(metrics.revertRate).toBe(0);
      expect(metrics.avgQualityDelta).toBe(0);
      expect(metrics.totalImprovements).toBe(0);
      expect(metrics.totalReverts).toBe(0);
    });

    it('calculates success rate correctly', () => {
      // Two improvements: one successful, one not
      const id1 = recordImprovement({
        level: 0, type: 'a', description: 'A',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id1, 0.7); // success: +0.2

      const id2 = recordImprovement({
        level: 0, type: 'b', description: 'B',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id2, 0.4); // failure: -0.1

      const metrics = getMetaMetrics();
      expect(metrics.successRate).toBe(0.5); // 1 of 2
      expect(metrics.totalImprovements).toBe(2);
    });

    it('calculates revert rate correctly', () => {
      const id1 = recordImprovement({
        level: 0, type: 'a', description: 'A',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      markReverted(id1);

      recordImprovement({
        level: 0, type: 'b', description: 'B',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });

      const metrics = getMetaMetrics();
      expect(metrics.revertRate).toBe(0.5); // 1 of 2 reverted
      expect(metrics.totalReverts).toBe(1);
    });

    it('calculates average quality delta', () => {
      const id1 = recordImprovement({
        level: 0, type: 'a', description: 'A',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id1, 0.7); // delta: +0.2

      const id2 = recordImprovement({
        level: 0, type: 'b', description: 'B',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id2, 0.6); // delta: +0.1

      const metrics = getMetaMetrics();
      expect(metrics.avgQualityDelta).toBeCloseTo(0.15); // (0.2 + 0.1) / 2
    });

    it('provides level breakdown', () => {
      const id0 = recordImprovement({
        level: 0, type: 'a', description: 'A',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id0, 0.7);

      const id1 = recordImprovement({
        level: 1, type: 'b', description: 'B',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id1, 0.6);

      const metrics = getMetaMetrics();
      expect(metrics.levelBreakdown[0].count).toBe(1);
      expect(metrics.levelBreakdown[0].successRate).toBe(1);
      expect(metrics.levelBreakdown[1].count).toBe(1);
      expect(metrics.levelBreakdown[2].count).toBe(0);
    });

    it('respects window days filter', () => {
      // Record with old date
      const id = recordImprovement({
        level: 0, type: 'old', description: 'Old',
        appliedAt: new Date(Date.now() - 40 * 86400000), // 40 days ago
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });
      measureOutcome(id, 0.7);

      const metrics = getMetaMetrics(30); // 30-day window
      expect(metrics.totalImprovements).toBe(0); // filtered out
    });
  });

  describe('getImprovementHistory', () => {
    it('returns records in reverse chronological order', () => {
      recordImprovement({
        level: 0, type: 'first', description: 'First',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });

      recordImprovement({
        level: 0, type: 'second', description: 'Second',
        appliedAt: new Date(),
        configBefore: {}, configAfter: {},
        qualityBefore: 0.5,
      });

      const history = getImprovementHistory();
      expect(history.length).toBe(2);
      expect(history[0].type).toBe('second'); // most recent first
      expect(history[1].type).toBe('first');
    });

    it('respects limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        recordImprovement({
          level: 0, type: `item-${i}`, description: `Item ${i}`,
          appliedAt: new Date(),
          configBefore: {}, configAfter: {},
          qualityBefore: 0.5,
        });
      }

      const history = getImprovementHistory(3);
      expect(history.length).toBe(3);
    });
  });

  describe('getImprovementById', () => {
    it('returns undefined for non-existent id', () => {
      expect(getImprovementById('nonexistent')).toBeUndefined();
    });

    it('returns the correct record', () => {
      const id = recordImprovement({
        level: 1, type: 'meta', description: 'Meta improvement',
        appliedAt: new Date(),
        configBefore: { x: 1 }, configAfter: { x: 2 },
        qualityBefore: 0.5,
      });

      const record = getImprovementById(id);
      expect(record).toBeDefined();
      expect(record!.level).toBe(1);
      expect(record!.type).toBe('meta');
    });
  });
});
