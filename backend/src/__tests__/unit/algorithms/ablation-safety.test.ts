/**
 * PMA Ablation Safety Tests (Task 17a)
 *
 * Verifies that when PMA features are disabled via the ablation registry,
 * all formula changes revert to their original pre-PMA implementations.
 */

import { computeTagScore, SLEEP_DEFAULTS, type ReplayCandidate } from '../../../algorithms/sleep-simulation-selection';
import { createAblationRegistry, PMA_FEATURES } from '../../../algorithms/ablation';
import { resolveContradictionPreserving } from '../../../services/memory/sleep-compute';
import { recordNaturalRecall } from '../../../algorithms/fsrs-vmPFC';

describe('PMA Ablation Safety', () => {
  describe('TAG Score Gating', () => {
    const candidate: ReplayCandidate = {
      id: 'test-1',
      content: 'test',
      tdError: 0.8,
      reward: 0.7,
      source: 'real',
      relatedEntityIds: ['e1', 'e2', 'e3'],
      emotionalValence: 0.9,
      emotionalArousal: 0.8,
    };

    it('should use 4-term PMA formula when no registry (default enabled)', () => {
      const score = computeTagScore(candidate);
      // PMA formula: 0.34*0.8 + 0.30*0.7 + 0.21*0.6 + 0.15*(0.9*0.8)
      const expected = 0.34 * 0.8 + 0.30 * 0.7 + 0.21 * 0.6 + 0.15 * (0.9 * 0.8);
      expect(score).toBeCloseTo(expected, 5);
    });

    it('should use 4-term PMA formula when PMA enabled', () => {
      const registry = createAblationRegistry();
      registry.register(PMA_FEATURES.NEUROMODULATOR_ENGINE, 'test');
      const score = computeTagScore(candidate, SLEEP_DEFAULTS, registry);
      const expected = 0.34 * 0.8 + 0.30 * 0.7 + 0.21 * 0.6 + 0.15 * (0.9 * 0.8);
      expect(score).toBeCloseTo(expected, 5);
    });

    it('should use original 3-term formula when PMA disabled', () => {
      const registry = createAblationRegistry();
      registry.register(PMA_FEATURES.NEUROMODULATOR_ENGINE, 'test');
      registry.disable(PMA_FEATURES.NEUROMODULATOR_ENGINE);
      const score = computeTagScore(candidate, SLEEP_DEFAULTS, registry);
      // Original: 0.40*0.8 + 0.35*0.7 + 0.25*0.6 = 0.32 + 0.245 + 0.15 = 0.715
      const expected = 0.40 * 0.8 + 0.35 * 0.7 + 0.25 * 0.6;
      expect(score).toBeCloseTo(expected, 5);
    });

    it('should ignore emotional fields when PMA disabled', () => {
      const registry = createAblationRegistry();
      registry.register(PMA_FEATURES.NEUROMODULATOR_ENGINE, 'test');
      registry.disable(PMA_FEATURES.NEUROMODULATOR_ENGINE);

      const withEmotion = computeTagScore(candidate, SLEEP_DEFAULTS, registry);
      const withoutEmotion = computeTagScore(
        { ...candidate, emotionalValence: 0, emotionalArousal: 0 },
        SLEEP_DEFAULTS,
        registry,
      );
      expect(withEmotion).toBeCloseTo(withoutEmotion, 5);
    });

    it('should sum to ~1.0 for pre-PMA weights', () => {
      expect(0.40 + 0.35 + 0.25).toBeCloseTo(1.0);
    });

    it('should sum to ~1.0 for PMA weights', () => {
      expect(0.34 + 0.30 + 0.21 + 0.15).toBeCloseTo(1.0);
    });
  });

  describe('Contradiction Resolution Gating', () => {
    const mem1 = { id: 'm1', content: 'fact A', confidence: 0.8 };
    const mem2 = { id: 'm2', content: 'fact B', confidence: 0.7 };

    it('should preserve both hypotheses when PMA enabled and both high confidence', () => {
      const result = resolveContradictionPreserving(mem1, mem2, true);
      expect(result.action).toBe('preserve_both');
    });

    it('should auto-resolve destructively when PMA disabled', () => {
      const result = resolveContradictionPreserving(mem1, mem2, false);
      expect(result.action).toBe('auto_resolve');
      expect(result.winner).toBe('m1'); // higher confidence wins
    });

    it('should pick higher confidence winner when PMA disabled', () => {
      const result = resolveContradictionPreserving(
        { id: 'a', content: 'x', confidence: 0.3 },
        { id: 'b', content: 'y', confidence: 0.9 },
        false,
      );
      expect(result.winner).toBe('b');
    });
  });

  describe('Natural Recall Gating', () => {
    it('should return recall record when PMA enabled (default)', () => {
      const result = recordNaturalRecall('fact-1', 4);
      expect(result).not.toBeNull();
      expect(result?.factId).toBe('fact-1');
      expect(result?.grade).toBe(4);
    });

    it('should return recall record when explicitly enabled', () => {
      const result = recordNaturalRecall('fact-1', 4, true);
      expect(result).not.toBeNull();
    });

    it('should return null when PMA disabled', () => {
      const result = recordNaturalRecall('fact-1', 4, false);
      expect(result).toBeNull();
    });
  });
});
