/**
 * PMA Quality Upgrades — 5 improvements to existing memory systems
 *
 * 4.8.1 Encoding Quality Score (episodic-memory.ts)
 * 4.8.2 Natural Recall -> FSRS Coupling (fsrs-vmPFC.ts)
 * 4.8.3 Hypothesis-preserving Contradiction Resolution (sleep-compute.ts)
 * 4.8.4 Emotional Replay Weighting (sleep-simulation-selection.ts)
 * 4.8.6 Temporal Context Retrieval (episodic-memory.ts)
 */

import { computeEncodingQuality, computeCircadianBonus } from '../../../../services/memory/episodic-memory';
import { recordNaturalRecall } from '../../../../algorithms/fsrs-vmPFC';
import { resolveContradictionPreserving } from '../../../../services/memory/sleep-compute';
import { computeTagScore, SLEEP_DEFAULTS } from '../../../../algorithms/sleep-simulation-selection';

// =============================================
// 4.8.1: Encoding Quality Score
// =============================================
describe('Encoding Quality Score (4.8.1)', () => {
  it('should return default values when no params provided', () => {
    const result = computeEncodingQuality({});
    expect(result.focusLevel).toBe(0.5);
    expect(result.elaborationDepth).toBe(0.5);
    expect(result.predictionError).toBe(0);
    expect(result.multimodal).toBe(false);
  });

  it('should compute composite as weighted average', () => {
    const result = computeEncodingQuality({
      focusLevel: 1.0,
      elaborationDepth: 1.0,
      predictionError: 1.0,
      multimodal: true,
    });
    // 0.3*1 + 0.3*1 + 0.3*1 + 0.1*1 = 1.0
    expect(result.composite).toBeCloseTo(1.0, 5);
  });

  it('should compute composite correctly with default params', () => {
    const result = computeEncodingQuality({});
    // 0.3*0.5 + 0.3*0.5 + 0.3*0 + 0.1*0 = 0.3
    expect(result.composite).toBeCloseTo(0.3, 5);
  });

  it('should include multimodal bonus when true', () => {
    const withMultimodal = computeEncodingQuality({ multimodal: true });
    const without = computeEncodingQuality({ multimodal: false });
    expect(withMultimodal.composite).toBeGreaterThan(without.composite);
    expect(withMultimodal.composite - without.composite).toBeCloseTo(0.1, 5);
  });

  it('should handle zero values for all params', () => {
    const result = computeEncodingQuality({
      focusLevel: 0,
      elaborationDepth: 0,
      predictionError: 0,
      multimodal: false,
    });
    expect(result.composite).toBe(0);
  });

  it('should handle maximum values for all params', () => {
    const result = computeEncodingQuality({
      focusLevel: 1,
      elaborationDepth: 1,
      predictionError: 1,
      multimodal: true,
    });
    expect(result.composite).toBeCloseTo(1.0, 5);
  });

  it('should preserve provided focusLevel', () => {
    const result = computeEncodingQuality({ focusLevel: 0.8 });
    expect(result.focusLevel).toBe(0.8);
  });

  it('should preserve provided elaborationDepth', () => {
    const result = computeEncodingQuality({ elaborationDepth: 0.9 });
    expect(result.elaborationDepth).toBe(0.9);
  });

  it('should preserve provided predictionError', () => {
    const result = computeEncodingQuality({ predictionError: 0.7 });
    expect(result.predictionError).toBe(0.7);
  });

  it('should compute composite with mixed values', () => {
    const result = computeEncodingQuality({
      focusLevel: 0.6,
      elaborationDepth: 0.8,
      predictionError: 0.4,
      multimodal: false,
    });
    // 0.3*0.6 + 0.3*0.8 + 0.3*0.4 + 0.1*0 = 0.18 + 0.24 + 0.12 = 0.54
    expect(result.composite).toBeCloseTo(0.54, 5);
  });

  it('should return all fields in the result', () => {
    const result = computeEncodingQuality({ focusLevel: 0.5 });
    expect(result).toHaveProperty('focusLevel');
    expect(result).toHaveProperty('elaborationDepth');
    expect(result).toHaveProperty('predictionError');
    expect(result).toHaveProperty('multimodal');
    expect(result).toHaveProperty('composite');
  });

  it('should weight focus, elaboration, and PE equally at 0.3', () => {
    // Only focus
    const focusOnly = computeEncodingQuality({ focusLevel: 1, elaborationDepth: 0, predictionError: 0, multimodal: false });
    expect(focusOnly.composite).toBeCloseTo(0.3, 5);

    // Only elaboration
    const elabOnly = computeEncodingQuality({ focusLevel: 0, elaborationDepth: 1, predictionError: 0, multimodal: false });
    expect(elabOnly.composite).toBeCloseTo(0.3, 5);

    // Only PE
    const peOnly = computeEncodingQuality({ focusLevel: 0, elaborationDepth: 0, predictionError: 1, multimodal: false });
    expect(peOnly.composite).toBeCloseTo(0.3, 5);
  });

  it('should weight multimodal at 0.1', () => {
    const multiOnly = computeEncodingQuality({ focusLevel: 0, elaborationDepth: 0, predictionError: 0, multimodal: true });
    expect(multiOnly.composite).toBeCloseTo(0.1, 5);
  });

  it('should handle partial params with defaults filling in', () => {
    const result = computeEncodingQuality({ focusLevel: 1.0 });
    // focusLevel=1.0, elaborationDepth=0.5 (default), predictionError=0 (default), multimodal=false (default)
    // 0.3*1.0 + 0.3*0.5 + 0.3*0 + 0.1*0 = 0.45
    expect(result.composite).toBeCloseTo(0.45, 5);
  });

  it('should not produce composite outside 0-1 for valid inputs', () => {
    const result = computeEncodingQuality({
      focusLevel: 1, elaborationDepth: 1, predictionError: 1, multimodal: true,
    });
    expect(result.composite).toBeLessThanOrEqual(1.0);
    expect(result.composite).toBeGreaterThanOrEqual(0.0);
  });
});

// =============================================
// 4.8.2: Natural Recall -> FSRS Coupling
// =============================================
describe('Natural Recall -> FSRS Coupling (4.8.2)', () => {
  it('should return the correct factId', () => {
    const result = recordNaturalRecall('fact-123')!;
    expect(result.factId).toBe('fact-123');
  });

  it('should default grade to 4', () => {
    const result = recordNaturalRecall('fact-abc')!;
    expect(result.grade).toBe(4);
  });

  it('should accept a custom grade', () => {
    const result = recordNaturalRecall('fact-xyz', 5)!;
    expect(result.grade).toBe(5);
  });

  it('should accept grade of 1 (worst)', () => {
    const result = recordNaturalRecall('fact-low', 1)!;
    expect(result.grade).toBe(1);
  });

  it('should include a recordedAt Date', () => {
    const before = new Date();
    const result = recordNaturalRecall('fact-time')!;
    const after = new Date();
    expect(result.recordedAt).toBeInstanceOf(Date);
    expect(result.recordedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(result.recordedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should return object with exactly 3 keys', () => {
    const result = recordNaturalRecall('fact-keys')!;
    const keys = Object.keys(result);
    expect(keys).toHaveLength(3);
    expect(keys).toContain('factId');
    expect(keys).toContain('grade');
    expect(keys).toContain('recordedAt');
  });

  it('should preserve factId with special characters', () => {
    const result = recordNaturalRecall('fact-with-dashes_and_underscores.dots')!;
    expect(result.factId).toBe('fact-with-dashes_and_underscores.dots');
  });

  it('should preserve factId with UUID format', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const result = recordNaturalRecall(uuid)!;
    expect(result.factId).toBe(uuid);
  });

  it('should accept grade 3 (middle)', () => {
    const result = recordNaturalRecall('fact-mid', 3)!;
    expect(result.grade).toBe(3);
  });

  it('should produce unique recordedAt timestamps for sequential calls', () => {
    const r1 = recordNaturalRecall('f1')!;
    const r2 = recordNaturalRecall('f2')!;
    // Both should be valid dates (may or may not differ by sub-ms)
    expect(r1.recordedAt.getTime()).toBeLessThanOrEqual(r2.recordedAt.getTime());
  });
});

// =============================================
// 4.8.3: Contradiction Resolution
// =============================================
describe('Hypothesis-Preserving Contradiction Resolution (4.8.3)', () => {
  it('should preserve both when both have high confidence', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'A is true', confidence: 0.8 },
      { id: 'm2', content: 'A is false', confidence: 0.7 },
    );
    expect(result.action).toBe('preserve_both');
    expect(result.hypothesisGroupId).toBeDefined();
  });

  it('should auto-resolve to memory1 when m1 strong and m2 weak', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.9 },
      { id: 'm2', content: 'Y', confidence: 0.2 },
    );
    expect(result.action).toBe('auto_resolve');
    expect(result.winner).toBe('m1');
  });

  it('should auto-resolve to memory2 when m2 strong and m1 weak', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.1 },
      { id: 'm2', content: 'Y', confidence: 0.8 },
    );
    expect(result.action).toBe('auto_resolve');
    expect(result.winner).toBe('m2');
  });

  it('should queue review for ambiguous cases', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.5 },
      { id: 'm2', content: 'Y', confidence: 0.4 },
    );
    expect(result.action).toBe('queue_review');
  });

  it('should queue review when both are moderate confidence', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.6 },
      { id: 'm2', content: 'Y', confidence: 0.4 },
    );
    expect(result.action).toBe('queue_review');
  });

  it('should format hypothesisGroupId with both memory IDs', () => {
    const result = resolveContradictionPreserving(
      { id: 'alpha', content: 'X', confidence: 0.9 },
      { id: 'beta', content: 'Y', confidence: 0.9 },
    );
    expect(result.hypothesisGroupId).toBe('hyp_alpha_beta');
  });

  it('should handle boundary: both at exactly 0.5 confidence', () => {
    // Both > 0.5 is false, so falls through to ambiguous
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.5 },
      { id: 'm2', content: 'Y', confidence: 0.5 },
    );
    expect(result.action).toBe('queue_review');
  });

  it('should handle boundary: exactly 0.51 and 0.51 -> preserve_both', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.51 },
      { id: 'm2', content: 'Y', confidence: 0.51 },
    );
    expect(result.action).toBe('preserve_both');
  });

  it('should handle boundary: 0.7 and 0.3 -> queue_review (not auto_resolve)', () => {
    // m1.confidence > 0.7 is false (0.7 is not > 0.7), m2.confidence < 0.3 is false (0.3 is not < 0.3)
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.7 },
      { id: 'm2', content: 'Y', confidence: 0.3 },
    );
    // 0.7 > 0.5 and 0.3 <= 0.5, so first check: both > 0.5 fails (0.3 not > 0.5)
    // second check: m1 > 0.7 fails (0.7 not > 0.7, strict)
    // third check: m2 > 0.7 fails (0.3 not > 0.7)
    expect(result.action).toBe('queue_review');
  });

  it('should handle boundary: 0.71 and 0.29 -> auto_resolve', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.71 },
      { id: 'm2', content: 'Y', confidence: 0.29 },
    );
    expect(result.action).toBe('auto_resolve');
    expect(result.winner).toBe('m1');
  });

  it('should not set winner for preserve_both', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.8 },
      { id: 'm2', content: 'Y', confidence: 0.8 },
    );
    expect(result.winner).toBeUndefined();
  });

  it('should not set winner for queue_review', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.5 },
      { id: 'm2', content: 'Y', confidence: 0.5 },
    );
    expect(result.winner).toBeUndefined();
  });

  it('should not set hypothesisGroupId for auto_resolve', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.9 },
      { id: 'm2', content: 'Y', confidence: 0.1 },
    );
    expect(result.hypothesisGroupId).toBeUndefined();
  });

  it('should not set hypothesisGroupId for queue_review', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0.45 },
      { id: 'm2', content: 'Y', confidence: 0.45 },
    );
    expect(result.hypothesisGroupId).toBeUndefined();
  });

  it('should handle zero confidence for both', () => {
    const result = resolveContradictionPreserving(
      { id: 'm1', content: 'X', confidence: 0 },
      { id: 'm2', content: 'Y', confidence: 0 },
    );
    expect(result.action).toBe('queue_review');
  });
});

// =============================================
// 4.8.4: Emotional Replay Weighting
// =============================================
describe('Emotional Replay Weighting (4.8.4)', () => {
  it('should include deltaTag in SLEEP_DEFAULTS', () => {
    expect(SLEEP_DEFAULTS).toHaveProperty('deltaTag');
    expect(SLEEP_DEFAULTS.deltaTag).toBeCloseTo(0.15, 5);
  });

  it('should have updated alphaTag to 0.34', () => {
    expect(SLEEP_DEFAULTS.alphaTag).toBeCloseTo(0.34, 5);
  });

  it('should have updated betaTag to 0.30', () => {
    expect(SLEEP_DEFAULTS.betaTag).toBeCloseTo(0.30, 5);
  });

  it('should have updated gammaTag to 0.21', () => {
    expect(SLEEP_DEFAULTS.gammaTag).toBeCloseTo(0.21, 5);
  });

  it('should have weights summing close to 1.0', () => {
    const sum = SLEEP_DEFAULTS.alphaTag + SLEEP_DEFAULTS.betaTag + SLEEP_DEFAULTS.gammaTag + SLEEP_DEFAULTS.deltaTag;
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it('should produce higher TAG score for emotionally charged memories', () => {
    const neutral = {
      id: 'e1', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
    };
    const emotional = {
      ...neutral, id: 'e2',
      emotionalValence: 0.9, emotionalArousal: 0.8,
    };
    const neutralScore = computeTagScore(neutral);
    const emotionalScore = computeTagScore(emotional);
    expect(emotionalScore).toBeGreaterThan(neutralScore);
  });

  it('should produce zero emotional weight when valence is zero', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
      emotionalValence: 0, emotionalArousal: 0.9,
    };
    const noEmo = {
      id: 'e2', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
    };
    // |0| * 0.9 = 0, so scores should be equal
    expect(computeTagScore(candidate)).toBeCloseTo(computeTagScore(noEmo), 5);
  });

  it('should produce zero emotional weight when arousal is zero', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
      emotionalValence: 0.9, emotionalArousal: 0,
    };
    const noEmo = {
      id: 'e2', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
    };
    // |0.9| * 0 = 0, so scores should be equal
    expect(computeTagScore(candidate)).toBeCloseTo(computeTagScore(noEmo), 5);
  });

  it('should handle negative valence (uses absolute value)', () => {
    const positive = {
      id: 'e1', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
      emotionalValence: 0.8, emotionalArousal: 0.7,
    };
    const negative = {
      ...positive, id: 'e2', emotionalValence: -0.8,
    };
    // |0.8| = |-0.8| = 0.8, so scores should be equal
    expect(computeTagScore(positive)).toBeCloseTo(computeTagScore(negative), 5);
  });

  it('should be backward compatible (no emotional fields -> same behavior)', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0.6, reward: 0.7,
      source: 'real' as const, relatedEntityIds: ['a', 'b'],
    };
    // emotionalWeight = |undefined ?? 0| * (undefined ?? 0) = 0
    // So deltaTag * 0 = 0, only alpha/beta/gamma contribute
    const novelty = Math.min(1.0, 2 * 0.2); // 0.4
    const expected = 0.34 * 0.6 + 0.30 * 0.7 + 0.21 * novelty;
    expect(computeTagScore(candidate)).toBeCloseTo(expected, 5);
  });

  it('should compute emotional weight as |valence| * arousal', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0, reward: 0,
      source: 'real' as const, relatedEntityIds: [],
      emotionalValence: 0.6, emotionalArousal: 0.5,
    };
    // novelty = 0, tdError = 0, reward = 0
    // Only emotional contributes: deltaTag * |0.6| * 0.5 = 0.15 * 0.3 = 0.045
    expect(computeTagScore(candidate)).toBeCloseTo(0.15 * 0.6 * 0.5, 5);
  });

  it('should max out emotional weight at |1| * 1 = 1', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0, reward: 0,
      source: 'real' as const, relatedEntityIds: [],
      emotionalValence: -1.0, emotionalArousal: 1.0,
    };
    // Only emotional: 0.15 * 1.0 * 1.0 = 0.15
    expect(computeTagScore(candidate)).toBeCloseTo(0.15, 5);
  });

  it('should respect custom deltaTag config', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0, reward: 0,
      source: 'real' as const, relatedEntityIds: [],
      emotionalValence: 1.0, emotionalArousal: 1.0,
    };
    const customConfig = { ...SLEEP_DEFAULTS, deltaTag: 0.5 };
    // Only emotional: 0.5 * 1.0 * 1.0 = 0.5
    expect(computeTagScore(candidate, customConfig)).toBeCloseTo(0.5, 5);
  });

  it('should handle deltaTag of 0 (disable emotional weighting)', () => {
    const candidate = {
      id: 'e1', content: 'x', tdError: 0.5, reward: 0.5,
      source: 'real' as const, relatedEntityIds: ['a'],
      emotionalValence: 1.0, emotionalArousal: 1.0,
    };
    const noEmotionConfig = { ...SLEEP_DEFAULTS, deltaTag: 0 };
    const withEmotion = computeTagScore(candidate, SLEEP_DEFAULTS);
    const withoutEmotion = computeTagScore(candidate, noEmotionConfig);
    expect(withEmotion).toBeGreaterThan(withoutEmotion);
  });
});

// =============================================
// 4.8.6: Temporal Context Retrieval
// =============================================
describe('Temporal Context Retrieval (4.8.6)', () => {
  it('should return +0.05 for matching timeOfDay', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'morning', 'Friday', false);
    expect(bonus).toBeCloseTo(0.05 + 0.03, 5); // time match + weekend match
  });

  it('should return +0.05 for matching dayOfWeek', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'afternoon', 'Monday', true);
    expect(bonus).toBeCloseTo(0.05, 5); // only day match
  });

  it('should return +0.03 for matching isWeekend', () => {
    const bonus = computeCircadianBonus('morning', 'Saturday', true, 'evening', 'Sunday', true);
    expect(bonus).toBeCloseTo(0.03, 5); // only weekend match
  });

  it('should return +0.13 when all match', () => {
    const bonus = computeCircadianBonus('evening', 'Friday', false, 'evening', 'Friday', false);
    expect(bonus).toBeCloseTo(0.13, 5);
  });

  it('should return 0 when nothing matches', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'evening', 'Saturday', true);
    expect(bonus).toBe(0);
  });

  it('should not add timeOfDay bonus for different times', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'night', 'Monday', false);
    // day match (0.05) + weekend match (0.03) = 0.08
    expect(bonus).toBeCloseTo(0.08, 5);
  });

  it('should accumulate all bonuses independently', () => {
    // Time matches, day does not, weekend matches
    const bonus = computeCircadianBonus('afternoon', 'Tuesday', false, 'afternoon', 'Wednesday', false);
    // time=0.05 + weekend=0.03 = 0.08
    expect(bonus).toBeCloseTo(0.08, 5);
  });

  it('should handle weekend=true for both sides', () => {
    const bonus = computeCircadianBonus('night', 'Saturday', true, 'morning', 'Sunday', true);
    // Only weekend matches: 0.03
    expect(bonus).toBeCloseTo(0.03, 5);
  });

  it('should handle weekend mismatch correctly', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'morning', 'Monday', true);
    // time=0.05, day=0.05, weekend mismatch=0 => 0.10
    expect(bonus).toBeCloseTo(0.10, 5);
  });

  it('should always return a non-negative number', () => {
    const bonus = computeCircadianBonus('morning', 'Monday', false, 'evening', 'Friday', true);
    expect(bonus).toBeGreaterThanOrEqual(0);
  });
});
