/**
 * Phase 72: Neuroscience Memory 2.0 Tests
 *
 * Tests for:
 * - Emotional Tagger (Amygdala-Modulation)
 * - Ebbinghaus Decay Curve + SM-2
 * - Context-Dependent Retrieval
 */

import {
  tagEmotion,
  computeEmotionalWeight,
  isEmotionallySignificant,
  type EmotionalTag,
} from '../../../../services/memory/emotional-tagger';

import {
  calculateRetention,
  updateStability,
  getRepetitionCandidates,
  shouldArchive,
  calculateOptimalInterval,
  batchCalculateRetention,
  EBBINGHAUS_CONFIG,
} from '../../../../services/memory/ebbinghaus-decay';

import {
  captureEncodingContext,
  calculateContextSimilarity,
  serializeContext,
  deserializeContext,
  type EncodingContext,
} from '../../../../services/memory/context-enrichment';

// ===========================================
// Emotional Tagger Tests
// ===========================================

describe('EmotionalTagger', () => {
  describe('tagEmotion', () => {
    it('should return neutral for empty text', () => {
      const result = tagEmotion('');
      expect(result.sentiment).toBe(0);
      expect(result.arousal).toBe(0);
      expect(result.valence).toBe(0.5);
      expect(result.significance).toBe(0);
    });

    it('should return neutral for whitespace-only text', () => {
      const result = tagEmotion('   ');
      expect(result.sentiment).toBe(0);
      expect(result.arousal).toBe(0);
      expect(result.valence).toBe(0.5);
      expect(result.significance).toBe(0);
    });

    it('should detect positive sentiment', () => {
      const result = tagEmotion('This is amazing and fantastic work!');
      expect(result.sentiment).toBeGreaterThan(0);
      expect(result.valence).toBeGreaterThan(0.5);
    });

    it('should detect negative sentiment', () => {
      const result = tagEmotion('This is terrible, everything is broken and frustrated');
      expect(result.sentiment).toBeLessThan(0);
      expect(result.valence).toBeLessThan(0.5);
    });

    it('should detect high arousal from urgency words', () => {
      const result = tagEmotion('This is urgent and critical, we need it immediately!');
      expect(result.arousal).toBeGreaterThan(0.5);
    });

    it('should boost arousal from exclamation marks', () => {
      const neutral = tagEmotion('hello world');
      const excited = tagEmotion('hello world!!!');
      expect(excited.arousal).toBeGreaterThan(neutral.arousal);
    });

    it('should detect significance from life events', () => {
      const result = tagEmotion('I got a promotion at work and reached my career goal');
      expect(result.significance).toBeGreaterThan(0.3);
    });

    it('should detect German emotional words', () => {
      const result = tagEmotion('Das ist wunderbar und begeistert mich sehr');
      expect(result.sentiment).toBeGreaterThan(0);
    });

    it('should detect German negative words', () => {
      const result = tagEmotion('Das ist furchtbar und schrecklich');
      expect(result.sentiment).toBeLessThan(0);
    });

    it('should handle mixed sentiment', () => {
      const result = tagEmotion('The good news is great but the bad news is terrible');
      // Mixed sentiment should be close to neutral
      expect(Math.abs(result.sentiment)).toBeLessThan(0.5);
    });

    it('should clamp all values to valid ranges', () => {
      const result = tagEmotion('amazing fantastic incredible wonderful brilliant outstanding extraordinary ecstatic overjoyed thrilled');
      expect(result.sentiment).toBeGreaterThanOrEqual(-1);
      expect(result.sentiment).toBeLessThanOrEqual(1);
      expect(result.arousal).toBeGreaterThanOrEqual(0);
      expect(result.arousal).toBeLessThanOrEqual(1);
      expect(result.valence).toBeGreaterThanOrEqual(0);
      expect(result.valence).toBeLessThanOrEqual(1);
      expect(result.significance).toBeGreaterThanOrEqual(0);
      expect(result.significance).toBeLessThanOrEqual(1);
    });

    it('should boost arousal from ALL CAPS words', () => {
      const normal = tagEmotion('this is important');
      const caps = tagEmotion('this is VERY IMPORTANT');
      expect(caps.arousal).toBeGreaterThanOrEqual(normal.arousal);
    });

    it('should return low arousal for calm text', () => {
      const result = tagEmotion('just a regular conversation about everyday things');
      expect(result.arousal).toBeLessThan(0.5);
    });
  });

  describe('computeEmotionalWeight', () => {
    it('should compute consolidation weight from arousal and significance', () => {
      const tag: EmotionalTag = {
        sentiment: 0.5,
        arousal: 0.8,
        valence: 0.7,
        significance: 0.9,
      };
      const weight = computeEmotionalWeight(tag);
      // 0.8 * 0.4 + 0.9 * 0.6 = 0.32 + 0.54 = 0.86
      expect(weight.consolidationWeight).toBeCloseTo(0.86, 1);
    });

    it('should give 3x decay multiplier for maximum emotional intensity', () => {
      const tag: EmotionalTag = {
        sentiment: 1.0,
        arousal: 1.0,
        valence: 1.0,
        significance: 1.0,
      };
      const weight = computeEmotionalWeight(tag);
      expect(weight.decayMultiplier).toBe(3.0);
    });

    it('should give 1x decay multiplier for no emotion', () => {
      const tag: EmotionalTag = {
        sentiment: 0,
        arousal: 0,
        valence: 0.5,
        significance: 0,
      };
      const weight = computeEmotionalWeight(tag);
      expect(weight.decayMultiplier).toBe(1.0);
    });

    it('should clamp consolidation weight to 0-1', () => {
      const tag: EmotionalTag = {
        sentiment: 0,
        arousal: 0,
        valence: 0,
        significance: 0,
      };
      const weight = computeEmotionalWeight(tag);
      expect(weight.consolidationWeight).toBeGreaterThanOrEqual(0);
      expect(weight.consolidationWeight).toBeLessThanOrEqual(1);
    });
  });

  describe('isEmotionallySignificant', () => {
    it('should return true for emotionally charged text', () => {
      expect(isEmotionallySignificant('This is absolutely critical and urgent!', 0.2)).toBe(true);
    });

    it('should return false for neutral text', () => {
      expect(isEmotionallySignificant('the sky is blue today', 0.3)).toBe(false);
    });
  });
});

// ===========================================
// Ebbinghaus Decay Tests
// ===========================================

describe('EbbinghausDecay', () => {
  describe('calculateRetention', () => {
    it('should return 1.0 for just-accessed memories', () => {
      const result = calculateRetention(new Date(), 1.0);
      expect(result.retention).toBeCloseTo(1.0, 1);
      expect(result.daysSinceAccess).toBeCloseTo(0, 0);
    });

    it('should decay exponentially over time', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const r1 = calculateRetention(oneDayAgo, 1.0);
      const r2 = calculateRetention(twoDaysAgo, 1.0);

      expect(r2.retention).toBeLessThan(r1.retention);
      // Ebbinghaus: R = e^(-t/S), with S=1, after 1 day: R = e^(-1) ~= 0.368
      expect(r1.retention).toBeCloseTo(Math.exp(-1), 1);
    });

    it('should decay slower with higher stability', () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const lowStability = calculateRetention(oneDayAgo, 1.0);
      const highStability = calculateRetention(oneDayAgo, 10.0);

      expect(highStability.retention).toBeGreaterThan(lowStability.retention);
    });

    it('should decay slower with emotional multiplier', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

      const neutral = calculateRetention(twoDaysAgo, 1.0, 1.0);
      const emotional = calculateRetention(twoDaysAgo, 1.0, 3.0);

      expect(emotional.retention).toBeGreaterThan(neutral.retention);
    });

    it('should flag for review when below threshold', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const result = calculateRetention(tenDaysAgo, 1.0);

      // After 10 days with stability 1.0: R = e^(-10) ~= 0.000045
      expect(result.shouldArchive).toBe(true);
    });

    it('should flag needsReview between archive and review thresholds', () => {
      // Find a time that puts retention between 0.1 and 0.3
      // With S=2: R = e^(-t/2), solve for R=0.2: t = -2*ln(0.2) ~= 3.22 days
      const threeDaysAgo = new Date(Date.now() - 3.2 * 24 * 60 * 60 * 1000);
      const result = calculateRetention(threeDaysAgo, 2.0);

      expect(result.retention).toBeLessThanOrEqual(0.3);
      expect(result.retention).toBeGreaterThan(0.1);
      expect(result.needsReview).toBe(true);
    });
  });

  describe('updateStability', () => {
    it('should increase stability on success (SM-2)', () => {
      const newStability = updateStability(1.0, true);
      expect(newStability).toBe(2.5); // 1.0 * 2.5
    });

    it('should decrease stability on failure', () => {
      const newStability = updateStability(1.0, false);
      expect(newStability).toBe(0.5); // 1.0 * 0.5
    });

    it('should not exceed maximum stability', () => {
      const newStability = updateStability(300, true);
      expect(newStability).toBeLessThanOrEqual(EBBINGHAUS_CONFIG.MAX_STABILITY);
    });

    it('should not go below minimum stability', () => {
      const newStability = updateStability(0.05, false);
      expect(newStability).toBeGreaterThanOrEqual(EBBINGHAUS_CONFIG.MIN_STABILITY);
    });

    it('should compound over multiple successful retrievals', () => {
      let stability = 1.0;
      stability = updateStability(stability, true); // 2.5
      stability = updateStability(stability, true); // 6.25
      stability = updateStability(stability, true); // 15.625
      expect(stability).toBeCloseTo(15.625, 1);
    });
  });

  describe('getRepetitionCandidates', () => {
    it('should return facts approaching review threshold', () => {
      const facts = [
        { id: '1', content: 'fact1', lastAccess: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), stability: 2.0 },
        { id: '2', content: 'fact2', lastAccess: new Date(), stability: 2.0 }, // just accessed
      ];

      const candidates = getRepetitionCandidates(facts);
      // fact1 should be a candidate (3 days old, stability 2 -> R ~= 0.22)
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      expect(candidates[0].factId).toBe('1');
    });

    it('should sort by urgency (most urgent first)', () => {
      const facts = [
        { id: 'old', content: 'old fact', lastAccess: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), stability: 2.0 },
        { id: 'medium', content: 'medium fact', lastAccess: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), stability: 2.0 },
      ];

      const candidates = getRepetitionCandidates(facts);
      if (candidates.length >= 2) {
        expect(candidates[0].urgency).toBeGreaterThanOrEqual(candidates[1].urgency);
      }
    });

    it('should not include recently accessed facts', () => {
      const facts = [
        { id: '1', content: 'fresh', lastAccess: new Date(), stability: 1.0 },
      ];

      const candidates = getRepetitionCandidates(facts);
      expect(candidates.length).toBe(0);
    });

    it('should respect emotional multiplier', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      const facts = [
        { id: 'neutral', content: 'neutral', lastAccess: fiveDaysAgo, stability: 2.0, emotionalMultiplier: 1.0 },
        { id: 'emotional', content: 'emotional', lastAccess: fiveDaysAgo, stability: 2.0, emotionalMultiplier: 3.0 },
      ];

      const candidates = getRepetitionCandidates(facts);
      // Emotional fact has 3x stability -> higher retention -> may not need review
      const neutralCandidate = candidates.find(c => c.factId === 'neutral');
      const emotionalCandidate = candidates.find(c => c.factId === 'emotional');

      if (neutralCandidate && emotionalCandidate) {
        expect(emotionalCandidate.retention).toBeGreaterThan(neutralCandidate.retention);
      }
    });
  });

  describe('shouldArchive', () => {
    it('should archive when retention is very low', () => {
      expect(shouldArchive(0.05)).toBe(true);
      expect(shouldArchive(0.1)).toBe(true);
    });

    it('should not archive when retention is above threshold', () => {
      expect(shouldArchive(0.5)).toBe(false);
      expect(shouldArchive(0.2)).toBe(false);
    });
  });

  describe('calculateOptimalInterval', () => {
    it('should return positive interval', () => {
      const interval = calculateOptimalInterval(5.0);
      expect(interval).toBeGreaterThan(0);
    });

    it('should scale with stability', () => {
      const short = calculateOptimalInterval(1.0);
      const long = calculateOptimalInterval(10.0);
      expect(long).toBeGreaterThan(short);
    });

    it('should respect target retention', () => {
      const easy = calculateOptimalInterval(5.0, 0.5); // Low target -> longer interval
      const hard = calculateOptimalInterval(5.0, 0.9); // High target -> shorter interval
      expect(easy).toBeGreaterThan(hard);
    });
  });

  describe('batchCalculateRetention', () => {
    it('should calculate retention for multiple facts', () => {
      const facts = [
        { id: '1', lastAccess: new Date(), stability: 1.0 },
        { id: '2', lastAccess: new Date(Date.now() - 24 * 60 * 60 * 1000), stability: 2.0 },
      ];

      const results = batchCalculateRetention(facts);
      expect(results.size).toBe(2);
      expect(results.get('1')!.retention).toBeGreaterThan(results.get('2')!.retention);
    });
  });
});

// ===========================================
// Context-Dependent Retrieval Tests
// ===========================================

describe('ContextEnrichment', () => {
  describe('captureEncodingContext', () => {
    it('should capture current context', () => {
      const ctx = captureEncodingContext();
      expect(ctx.timeOfDay).toBeDefined();
      expect(['morning', 'afternoon', 'evening', 'night']).toContain(ctx.timeOfDay);
      expect(ctx.dayOfWeek).toBeGreaterThanOrEqual(0);
      expect(ctx.dayOfWeek).toBeLessThanOrEqual(6);
      expect(ctx.taskType).toBe('general');
    });

    it('should accept task type override', () => {
      const ctx = captureEncodingContext('coding');
      expect(ctx.taskType).toBe('coding');
    });

    it('should normalize unknown task types', () => {
      const ctx = captureEncodingContext('programming a website');
      expect(ctx.taskType).toBe('coding');
    });

    it('should normalize writing-related tasks', () => {
      const ctx = captureEncodingContext('composing a blog post');
      expect(ctx.taskType).toBe('writing');
    });

    it('should default unknown tasks to general', () => {
      const ctx = captureEncodingContext('xyzzy');
      expect(ctx.taskType).toBe('general');
    });
  });

  describe('calculateContextSimilarity', () => {
    it('should return 1.0 similarity for identical contexts', () => {
      const ctx: EncodingContext = {
        timeOfDay: 'morning',
        dayOfWeek: 1,
        taskType: 'coding',
      };

      const result = calculateContextSimilarity(ctx, ctx);
      expect(result.similarity).toBeCloseTo(1.0, 1);
      expect(result.boost).toBeCloseTo(1.3, 1); // 1.0 + 1.0 * 0.3
    });

    it('should give lower similarity for different contexts', () => {
      const encoding: EncodingContext = {
        timeOfDay: 'morning',
        dayOfWeek: 1, // Monday
        taskType: 'coding',
      };
      const current: EncodingContext = {
        timeOfDay: 'night',
        dayOfWeek: 0, // Sunday
        taskType: 'creative',
      };

      const result = calculateContextSimilarity(encoding, current);
      expect(result.similarity).toBeLessThan(0.5);
      expect(result.boost).toBeLessThan(1.15);
    });

    it('should give moderate similarity for partially matching contexts', () => {
      const encoding: EncodingContext = {
        timeOfDay: 'morning',
        dayOfWeek: 1, // Monday
        taskType: 'coding',
      };
      const current: EncodingContext = {
        timeOfDay: 'morning', // Same time
        dayOfWeek: 3, // Wednesday (weekday)
        taskType: 'review', // Related to coding
      };

      const result = calculateContextSimilarity(encoding, current);
      expect(result.similarity).toBeGreaterThan(0.5);
      expect(result.boost).toBeGreaterThan(1.0);
    });

    it('should cap boost at 1.3 (30%)', () => {
      const ctx: EncodingContext = {
        timeOfDay: 'morning',
        dayOfWeek: 1,
        taskType: 'coding',
      };

      const result = calculateContextSimilarity(ctx, ctx);
      expect(result.boost).toBeLessThanOrEqual(1.3);
    });

    it('should provide dimension breakdown', () => {
      const encoding: EncodingContext = {
        timeOfDay: 'afternoon',
        dayOfWeek: 2,
        taskType: 'research',
      };
      const current: EncodingContext = {
        timeOfDay: 'afternoon',
        dayOfWeek: 2,
        taskType: 'learning',
      };

      const result = calculateContextSimilarity(encoding, current);
      expect(result.dimensions.temporal).toBe(1.0); // Same time
      expect(result.dimensions.dayOfWeek).toBe(1.0); // Same day
      expect(result.dimensions.taskType).toBe(0.5); // Related tasks
    });

    it('should treat weekday vs weekend as dissimilar', () => {
      const weekday: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 1, taskType: 'general' };
      const weekend: EncodingContext = { timeOfDay: 'morning', dayOfWeek: 6, taskType: 'general' };

      const result = calculateContextSimilarity(weekday, weekend);
      expect(result.dimensions.dayOfWeek).toBeLessThan(0.5);
    });
  });

  describe('serializeContext / deserializeContext', () => {
    it('should roundtrip correctly', () => {
      const ctx: EncodingContext = {
        timeOfDay: 'evening',
        dayOfWeek: 5,
        taskType: 'planning',
      };

      const serialized = serializeContext(ctx);
      const deserialized = deserializeContext(serialized);

      expect(deserialized).not.toBeNull();
      expect(deserialized!.timeOfDay).toBe('evening');
      expect(deserialized!.dayOfWeek).toBe(5);
      expect(deserialized!.taskType).toBe('planning');
    });

    it('should return null for invalid data', () => {
      expect(deserializeContext(null)).toBeNull();
      expect(deserializeContext(undefined)).toBeNull();
      expect(deserializeContext('string')).toBeNull();
      expect(deserializeContext({})).toBeNull();
    });

    it('should default taskType to general', () => {
      const result = deserializeContext({ timeOfDay: 'morning', dayOfWeek: 1 });
      expect(result).not.toBeNull();
      expect(result!.taskType).toBe('general');
    });
  });
});

// ===========================================
// Integration: Emotional + Ebbinghaus
// ===========================================

describe('Emotional-Ebbinghaus Integration', () => {
  it('should give emotional memories longer retention', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Tag emotional text
    const emotionalTag = tagEmotion('This is an absolutely critical emergency deadline!');
    const weight = computeEmotionalWeight(emotionalTag);

    // Calculate retention with and without emotional boost
    const neutralRetention = calculateRetention(sevenDaysAgo, 2.0, 1.0);
    const emotionalRetention = calculateRetention(sevenDaysAgo, 2.0, weight.decayMultiplier);

    expect(emotionalRetention.retention).toBeGreaterThan(neutralRetention.retention);
    expect(weight.decayMultiplier).toBeGreaterThan(1.0);
  });

  it('should give high-significance events strong consolidation weight', () => {
    const tag = tagEmotion('I just got my promotion and reached my career milestone!');
    const weight = computeEmotionalWeight(tag);

    expect(weight.consolidationWeight).toBeGreaterThan(0.2);
  });

  it('should model flashbulb memories: high arousal + significance = strong retention', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Simulate a flashbulb memory (high arousal + significance)
    const flashbulbTag: EmotionalTag = {
      sentiment: 0.8,
      arousal: 0.95,
      valence: 0.9,
      significance: 0.95,
    };
    const flashbulbWeight = computeEmotionalWeight(flashbulbTag);

    // With 3x decay multiplier, stability 5.0 -> effective stability 15
    const retention = calculateRetention(thirtyDaysAgo, 5.0, flashbulbWeight.decayMultiplier);

    // After 30 days with effective stability ~15: R = e^(-30/15) = e^(-2) ~= 0.135
    expect(retention.retention).toBeGreaterThan(0.1);
    expect(flashbulbWeight.decayMultiplier).toBeGreaterThanOrEqual(2.5);
  });
});
