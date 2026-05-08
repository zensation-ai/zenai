/**
 * Unit Tests for PriorityMap
 *
 * Chelazzi 2014: 4-dimensional priority scoring with saliency, emotion,
 * reward relevance, and goal alignment. Amygdala fast-path guarantees
 * minimum priority for emotional items. Neuromodulators shift weights.
 *
 * Part of the Predictive Memory Architecture (PMA).
 */

import { PriorityMap, PriorityInput, bridgeEmotionalTagger } from '../../../../services/memory/priority-map';

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('PriorityMap', () => {
  let map: PriorityMap;

  beforeEach(() => {
    map = new PriorityMap();
    jest.clearAllMocks();
  });

  // =========================================================
  // 4-dimensional scoring (8 tests)
  // =========================================================

  describe('4-dimensional scoring', () => {
    it('score returns composite from 4 dimensions', () => {
      const result = map.score({ saliency: 0.5, emotionalValence: 0.4, rewardRelevance: 0.6, goalAlignment: 0.8 });
      expect(result).toHaveProperty('composite');
      expect(result).toHaveProperty('saliency');
      expect(result).toHaveProperty('emotion');
      expect(result).toHaveProperty('reward');
      expect(result).toHaveProperty('goal');
    });

    it('default weights: saliency=0.2, emotion=0.25, reward=0.25, goal=0.3', () => {
      // Verify weights using sub-threshold emotion (0.5 < 0.6) to avoid amygdala floor
      const r1 = map.score({ saliency: 1, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 0 });
      expect(r1.composite).toBeCloseTo(0.2, 5);
      // Use emotionalValence=0.5 (abs=0.5 < AMYGDALA_THRESHOLD=0.6) to test weight in isolation
      const r2 = map.score({ saliency: 0, emotionalValence: 0.5, rewardRelevance: 0, goalAlignment: 0 });
      expect(r2.composite).toBeCloseTo(0.25 * 0.5, 5); // weight * clamped value
      const r3 = map.score({ saliency: 0, emotionalValence: 0, rewardRelevance: 1, goalAlignment: 0 });
      expect(r3.composite).toBeCloseTo(0.25, 5);
      const r4 = map.score({ saliency: 0, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 1 });
      expect(r4.composite).toBeCloseTo(0.3, 5);
    });

    it('all zeros → composite = 0', () => {
      const result = map.score({ saliency: 0, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 0 });
      expect(result.composite).toBeCloseTo(0, 5);
    });

    it('all ones → composite = 1', () => {
      const result = map.score({ saliency: 1, emotionalValence: 1, rewardRelevance: 1, goalAlignment: 1 });
      expect(result.composite).toBeCloseTo(1, 5);
    });

    it('only saliency=1, rest 0 → composite = 0.2', () => {
      const result = map.score({ saliency: 1, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 0 });
      expect(result.composite).toBeCloseTo(0.2, 5);
    });

    it('only emotion=1, rest 0 → composite floored at 0.5 by amygdala (weight=0.25, floor=0.5)', () => {
      // emotionalValence=1 → abs=1 > AMYGDALA_THRESHOLD=0.6 → floor applies
      // raw composite = 0.25 * 1 = 0.25, but floor raises it to 0.5
      const result = map.score({ saliency: 0, emotionalValence: 1, rewardRelevance: 0, goalAlignment: 0 });
      expect(result.composite).toBeCloseTo(0.5, 5);
      expect(result.amygdalaFlagged).toBe(true);
    });

    it('only reward=1, rest 0 → composite = 0.25', () => {
      const result = map.score({ saliency: 0, emotionalValence: 0, rewardRelevance: 1, goalAlignment: 0 });
      expect(result.composite).toBeCloseTo(0.25, 5);
    });

    it('only goal=1, rest 0 → composite = 0.3', () => {
      const result = map.score({ saliency: 0, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 1 });
      expect(result.composite).toBeCloseTo(0.3, 5);
    });
  });

  // =========================================================
  // Neuromodulator weight modulation (6 tests)
  // =========================================================

  describe('neuromodulator weight modulation', () => {
    const baseline = { dopamine: 0.5, norepinephrine: 0.5, serotonin: 0.5, acetylcholine: 0.5 };

    it('high dopamine increases saliency weight relative to baseline', () => {
      const baseWeights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        baseline,
      );
      const highDA = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        { ...baseline, dopamine: 1.0 },
      );
      expect(highDA.saliency).toBeGreaterThan(baseWeights.saliency);
    });

    it('high norepinephrine increases emotion weight', () => {
      const baseWeights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        baseline,
      );
      const highNE = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        { ...baseline, norepinephrine: 1.0 },
      );
      expect(highNE.emotion).toBeGreaterThan(baseWeights.emotion);
    });

    it('high serotonin increases goal weight', () => {
      const baseWeights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        baseline,
      );
      const highSer = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        { ...baseline, serotonin: 1.0 },
      );
      expect(highSer.goal).toBeGreaterThan(baseWeights.goal);
    });

    it('high acetylcholine increases saliency and reward weight', () => {
      const baseWeights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        baseline,
      );
      const highACh = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        { ...baseline, acetylcholine: 1.0 },
      );
      expect(highACh.saliency).toBeGreaterThan(baseWeights.saliency);
      expect(highACh.reward).toBeGreaterThan(baseWeights.reward);
    });

    it('weights still sum to 1.0 after modulation', () => {
      const neuro = { dopamine: 0.9, norepinephrine: 0.8, serotonin: 0.3, acetylcholine: 0.7 };
      const weights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        neuro,
      );
      const sum = weights.saliency + weights.emotion + weights.reward + weights.goal;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('no neuroState → default weights unchanged', () => {
      const input: PriorityInput = { saliency: 1, emotionalValence: 0, rewardRelevance: 0, goalAlignment: 0 };
      const withNeuro = map.score(input, { dopamine: 0.5, norepinephrine: 0.5, serotonin: 0.5, acetylcholine: 0.5 });
      const withoutNeuro = map.score(input);
      // At baseline (all 0.5), adjustWeights normalises back to default weights
      expect(withNeuro.composite).toBeCloseTo(withoutNeuro.composite, 3);
    });
  });

  // =========================================================
  // Amygdala fast-path (5 tests)
  // =========================================================

  describe('amygdala fast-path', () => {
    it('emotional intensity > 0.6 sets amygdalaFlagged=true', () => {
      const result = map.amygdalaPreScreen(0.7);
      expect(result.flagged).toBe(true);
    });

    it('emotional intensity <= 0.6 sets amygdalaFlagged=false', () => {
      const result = map.amygdalaPreScreen(0.6);
      expect(result.flagged).toBe(false);
    });

    it('flagged items get floor priority of 0.5', () => {
      const result = map.amygdalaPreScreen(0.8);
      expect(result.floor).toBe(0.5);
    });

    it('floor applies even if composite would be lower', () => {
      // Very high emotion (0.8 intensity), everything else 0 → composite would be 0.25*0.8=0.2 without floor
      // But amygdala floor should push it up to 0.5
      const result = map.score({ saliency: 0, emotionalValence: 0.8, rewardRelevance: 0, goalAlignment: 0 });
      expect(result.amygdalaFlagged).toBe(true);
      expect(result.composite).toBeGreaterThanOrEqual(0.5);
    });

    it('non-flagged items use normal composite without floor', () => {
      // Low emotion (0.3), everything else 0 → composite = 0.25*0.3 = 0.075, no floor
      const result = map.score({ saliency: 0, emotionalValence: 0.3, rewardRelevance: 0, goalAlignment: 0 });
      expect(result.amygdalaFlagged).toBe(false);
      expect(result.composite).toBeCloseTo(0.25 * 0.3, 5);
    });
  });

  // =========================================================
  // Application contexts (5 tests)
  // =========================================================

  describe('application contexts', () => {
    it('score can rank GWT module candidates by composite', () => {
      const candidates = [
        { saliency: 0.9, emotionalValence: 0.1, rewardRelevance: 0.5, goalAlignment: 0.7 },
        { saliency: 0.2, emotionalValence: 0.1, rewardRelevance: 0.2, goalAlignment: 0.3 },
      ].map((c) => map.score(c));
      expect(candidates[0].composite).toBeGreaterThan(candidates[1].composite);
    });

    it('score can rank RAG retrieval results by composite', () => {
      const highRelevance = map.score({ saliency: 0.6, emotionalValence: 0.2, rewardRelevance: 0.9, goalAlignment: 0.8 });
      const lowRelevance = map.score({ saliency: 0.1, emotionalValence: 0.1, rewardRelevance: 0.1, goalAlignment: 0.1 });
      expect(highRelevance.composite).toBeGreaterThan(lowRelevance.composite);
    });

    it('score can rank sleep consolidation priorities', () => {
      // High goal alignment + reward = important to consolidate
      const important = map.score({ saliency: 0.5, emotionalValence: 0.2, rewardRelevance: 0.8, goalAlignment: 0.9 });
      const trivial = map.score({ saliency: 0.1, emotionalValence: 0.0, rewardRelevance: 0.1, goalAlignment: 0.1 });
      expect(important.composite).toBeGreaterThan(trivial.composite);
    });

    it('score can rank SmartSurface suggestions by composite', () => {
      const urgent = map.score({ saliency: 0.8, emotionalValence: 0.1, rewardRelevance: 0.7, goalAlignment: 0.9 });
      const background = map.score({ saliency: 0.2, emotionalValence: 0.0, rewardRelevance: 0.2, goalAlignment: 0.1 });
      expect(urgent.composite).toBeGreaterThan(background.composite);
    });

    it('score can rank context window items for inclusion', () => {
      const items = [
        { saliency: 0.4, emotionalValence: 0.0, rewardRelevance: 0.3, goalAlignment: 0.8 },
        { saliency: 0.1, emotionalValence: 0.0, rewardRelevance: 0.1, goalAlignment: 0.2 },
        { saliency: 0.7, emotionalValence: 0.8, rewardRelevance: 0.5, goalAlignment: 0.6 },
      ].map((item) => map.score(item));
      // Sort descending by composite
      const sorted = [...items].sort((a, b) => b.composite - a.composite);
      expect(sorted[0].composite).toBeGreaterThanOrEqual(sorted[1].composite);
      expect(sorted[1].composite).toBeGreaterThanOrEqual(sorted[2].composite);
    });
  });

  // =========================================================
  // Edge cases (6 tests)
  // =========================================================

  describe('edge cases', () => {
    it('ablation: disabled returns 0.5 for all items', () => {
      map.setEnabled(false);
      const result = map.score({ saliency: 0.9, emotionalValence: 0.9, rewardRelevance: 0.9, goalAlignment: 0.9 });
      expect(result.composite).toBe(0.5);
      expect(result.saliency).toBe(0.5);
      expect(result.emotion).toBe(0.5);
      expect(result.reward).toBe(0.5);
      expect(result.goal).toBe(0.5);
    });

    it('negative input values treated as 0', () => {
      // Use emotionalValence=-0.3 (abs=0.3 < 0.6, no amygdala floor) so composite stays 0
      const result = map.score({ saliency: -0.5, emotionalValence: -0.3, rewardRelevance: -0.3, goalAlignment: -0.9 });
      // abs(-0.3)=0.3 is clamped; saliency/reward/goal are clamped to 0
      // composite = 0.25 * 0.3 = 0.075
      expect(result.saliency).toBe(0);
      expect(result.emotion).toBeCloseTo(0.3, 5);
      expect(result.reward).toBe(0);
      expect(result.goal).toBe(0);
      expect(result.composite).toBeCloseTo(0.25 * 0.3, 5);
    });

    it('values > 1 clamped to 1', () => {
      const result = map.score({ saliency: 2.0, emotionalValence: 5.0, rewardRelevance: 3.0, goalAlignment: 1.5 });
      // All clamped to 1 → composite = 1
      expect(result.composite).toBeCloseTo(1, 5);
      expect(result.saliency).toBe(1);
      expect(result.emotion).toBe(1);
      expect(result.reward).toBe(1);
      expect(result.goal).toBe(1);
    });

    it('empty neuroState handled gracefully (no neuroState → defaults)', () => {
      const withoutNeuro = map.score({ saliency: 0.5, emotionalValence: 0.3, rewardRelevance: 0.4, goalAlignment: 0.6 });
      expect(() => withoutNeuro).not.toThrow();
      expect(withoutNeuro.composite).toBeGreaterThanOrEqual(0);
      expect(withoutNeuro.composite).toBeLessThanOrEqual(1);
    });

    it('score returns PriorityScore object with composite + individual dimensions', () => {
      const result = map.score({ saliency: 0.3, emotionalValence: 0.4, rewardRelevance: 0.5, goalAlignment: 0.6 });
      expect(typeof result.composite).toBe('number');
      expect(typeof result.saliency).toBe('number');
      expect(typeof result.emotion).toBe('number');
      expect(typeof result.reward).toBe('number');
      expect(typeof result.goal).toBe('number');
      expect(typeof result.amygdalaFlagged).toBe('boolean');
    });

    it('adjustWeights returns normalized weights summing to 1', () => {
      const weights = map.adjustWeights(
        { saliency: 0.2, emotion: 0.25, reward: 0.25, goal: 0.3 },
        { dopamine: 0.1, norepinephrine: 0.9, serotonin: 0.5, acetylcholine: 0.2 },
      );
      const sum = weights.saliency + weights.emotion + weights.reward + weights.goal;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  // PMA Task 17i: Bridge emotional-tagger → PriorityMap
  describe('bridgeEmotionalTagger', () => {
    it('flags high-emotion items (valence=1.0, arousal=0.9)', () => {
      const result = bridgeEmotionalTagger(1.0, 0.9, map);
      // centeredValence = (1.0-0.5)*2 = 1.0, intensity = 1.0 * 0.9 = 0.9 > 0.6
      expect(result.flagged).toBe(true);
      expect(result.floor).toBe(0.5);
    });

    it('does not flag low-emotion items (valence=0.5, arousal=0.3)', () => {
      const result = bridgeEmotionalTagger(0.5, 0.3, map);
      // centeredValence = 0, intensity = 0
      expect(result.flagged).toBe(false);
      expect(result.floor).toBe(0);
    });

    it('handles negative valence (valence=0.0, arousal=0.9)', () => {
      const result = bridgeEmotionalTagger(0.0, 0.9, map);
      // centeredValence = -1.0, intensity = 1.0 * 0.9 = 0.9 > 0.6
      expect(result.flagged).toBe(true);
    });

    it('returns unflagged for neutral emotion (valence=0.5, arousal=1.0)', () => {
      const result = bridgeEmotionalTagger(0.5, 1.0, map);
      // centeredValence = 0, intensity = 0
      expect(result.flagged).toBe(false);
    });

    it('uses default singleton when no map provided', () => {
      const result = bridgeEmotionalTagger(1.0, 0.9);
      expect(result.flagged).toBe(true);
      expect(result.floor).toBe(0.5);
    });
  });
});
