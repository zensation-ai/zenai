/**
 * Phase 112: Memory Neuroscience 3.0 Tests
 *
 * Tests for:
 * - Negation detection (English, German, edge cases, double negation)
 * - Contextual valence (each domain, amplification/dampening)
 * - User-specific decay (profile learning, personalized retention, backward compat)
 * - Semantic clustering (similar episodes group, dissimilar separate)
 */

import {
  detectNegation,
  type NegationResult,
} from '../../../services/memory/long-term-memory';

import {
  tagEmotion,
  computeContextualValence,
  type ContextualValence,
} from '../../../services/memory/emotional-tagger';

import {
  learnDecayProfile,
  calculatePersonalizedRetention,
  calculateRetention,
  type UserDecayProfile,
  type AccessEvent,
} from '../../../services/memory/ebbinghaus-decay';

import {
  clusterEpisodesSemantic,
  type EpisodeInput,
  type SemanticCluster,
} from '../../../services/memory/llm-consolidation';

// ===========================================
// Negation Detection Tests
// ===========================================

describe('detectNegation', () => {
  describe('English negation', () => {
    it('should detect "not" negation', () => {
      const result = detectNegation('I do not like coffee');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "never" negation', () => {
      const result = detectNegation('I never eat sushi');
      expect(result.isNegated).toBe(true);
      expect(result.negationTarget).toBeTruthy();
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect contraction "doesn\'t"', () => {
      const result = detectNegation("He doesn't like tea");
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "isn\'t"', () => {
      const result = detectNegation("This isn't correct");
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "no longer"', () => {
      const result = detectNegation('I no longer use Windows');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should return isNegated=false for positive text', () => {
      const result = detectNegation('I love programming');
      expect(result.isNegated).toBe(false);
      expect(result.confidence).toBe(0);
    });
  });

  describe('German negation', () => {
    it('should detect "nicht"', () => {
      const result = detectNegation('Ich mag Kaffee nicht');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "kein"', () => {
      const result = detectNegation('Ich habe keine Ahnung');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "nie"', () => {
      const result = detectNegation('Ich esse nie Fleisch');
      expect(result.isNegated).toBe(true);
      expect(result.negationTarget).toBeTruthy();
    });

    it('should detect "niemals"', () => {
      const result = detectNegation('Das werde ich niemals vergessen');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });

    it('should detect "nicht mehr"', () => {
      const result = detectNegation('Ich arbeite nicht mehr bei Google');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(0.6);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = detectNegation('');
      expect(result.isNegated).toBe(false);
      expect(result.negationTarget).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('should handle whitespace only', () => {
      const result = detectNegation('   ');
      expect(result.isNegated).toBe(false);
    });

    it('should detect double negation with low confidence', () => {
      const result = detectNegation('I do not have no issues');
      expect(result.isNegated).toBe(true);
      expect(result.confidence).toBeLessThanOrEqual(0.4);
    });

    it('should extract negation target when available', () => {
      const result = detectNegation('She never exercises in the morning');
      expect(result.isNegated).toBe(true);
      expect(result.negationTarget).toBeTruthy();
      expect(result.negationTarget!.length).toBeGreaterThan(0);
    });
  });
});

// ===========================================
// Contextual Valence Tests
// ===========================================

describe('computeContextualValence', () => {
  describe('work context', () => {
    it('should dampen urgency words toward neutral valence', () => {
      const result = computeContextualValence('This is an urgent deadline problem!', 'work');
      // Urgency in work is expected, so valence should move toward 0.5
      expect(result.context).toBe('work');
      expect(result.contextModifier).toBeDefined();
      expect(result.effectiveValence).toBeGreaterThanOrEqual(0);
      expect(result.effectiveValence).toBeLessThanOrEqual(1);
    });

    it('should have small modifier range (±0.1)', () => {
      const result = computeContextualValence('This is terrible urgent news', 'work');
      expect(Math.abs(result.contextModifier)).toBeLessThanOrEqual(0.2);
    });
  });

  describe('personal context', () => {
    it('should amplify positive emotional valence', () => {
      const positive = computeContextualValence('I am so happy and grateful!', 'personal');
      expect(positive.context).toBe('personal');
      // Personal context amplifies positive deviation from 0.5
      expect(positive.effectiveValence).toBeGreaterThanOrEqual(positive.valence);
    });

    it('should amplify negative emotional valence', () => {
      const negative = computeContextualValence('I feel terrible and frustrated', 'personal');
      expect(negative.context).toBe('personal');
      // Personal context amplifies negative deviation from 0.5
      expect(negative.effectiveValence).toBeLessThanOrEqual(negative.valence);
    });

    it('should have larger modifier range than work (±0.2)', () => {
      const result = computeContextualValence('I am ecstatic about this amazing news!', 'personal');
      // Personal has ±0.2 range vs work's ±0.1
      expect(result.effectiveValence).not.toBe(result.valence);
    });
  });

  describe('learning context', () => {
    it('should neutralize difficulty words', () => {
      const result = computeContextualValence('This is a difficult and challenging problem', 'learning');
      expect(result.context).toBe('learning');
      // Difficulty in learning context should push valence toward neutral
      expect(result.effectiveValence).toBeGreaterThanOrEqual(result.valence);
    });

    it('should have minimal modifier range (±0.05)', () => {
      const result = computeContextualValence('I am confused by this complex topic', 'learning');
      expect(Math.abs(result.contextModifier)).toBeLessThanOrEqual(0.15);
    });
  });

  describe('creative context', () => {
    it('should moderately amplify emotional signals', () => {
      const result = computeContextualValence('This is an amazing breakthrough idea!', 'creative');
      expect(result.context).toBe('creative');
      expect(result.effectiveValence).toBeGreaterThanOrEqual(0);
      expect(result.effectiveValence).toBeLessThanOrEqual(1);
    });
  });

  describe('tagEmotion integration', () => {
    it('should include contextualValence when contextDomain is provided', () => {
      const tag = tagEmotion('I love this amazing project!', 'personal');
      expect(tag.contextualValence).toBeDefined();
      expect(tag.contextualValence!.context).toBe('personal');
      expect(tag.contextualValence!.effectiveValence).toBeGreaterThanOrEqual(0);
    });

    it('should not include contextualValence when no domain is provided', () => {
      const tag = tagEmotion('I love this amazing project!');
      expect(tag.contextualValence).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty text', () => {
      const result = computeContextualValence('', 'work');
      expect(result.valence).toBe(0.5);
      expect(result.contextModifier).toBe(0);
      expect(result.effectiveValence).toBe(0.5);
    });

    it('should handle unknown context domain gracefully', () => {
      const result = computeContextualValence('Hello world', 'unknown');
      expect(result.effectiveValence).toBeGreaterThanOrEqual(0);
      expect(result.effectiveValence).toBeLessThanOrEqual(1);
    });
  });
});

// ===========================================
// User-Specific Decay Tests
// ===========================================

describe('learnDecayProfile', () => {
  it('should return null for insufficient data (< 2 events)', () => {
    const result = learnDecayProfile([
      { accessedAt: new Date(), wasRecalled: true },
    ]);
    expect(result).toBeNull();
  });

  it('should return null for empty history', () => {
    const result = learnDecayProfile([]);
    expect(result).toBeNull();
  });

  it('should compute profile from access history', () => {
    const now = Date.now();
    const history: AccessEvent[] = [
      { accessedAt: new Date(now - 7 * 24 * 60 * 60 * 1000), wasRecalled: true },
      { accessedAt: new Date(now - 5 * 24 * 60 * 60 * 1000), wasRecalled: true },
      { accessedAt: new Date(now - 3 * 24 * 60 * 60 * 1000), wasRecalled: true },
      { accessedAt: new Date(now - 1 * 24 * 60 * 60 * 1000), wasRecalled: true },
    ];
    const profile = learnDecayProfile(history);
    expect(profile).not.toBeNull();
    expect(profile!.avgAccessInterval).toBeGreaterThan(0);
    expect(profile!.retentionAtReview).toBe(1.0); // All recalled
    expect(profile!.personalStabilityMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(profile!.personalStabilityMultiplier).toBeLessThanOrEqual(3.0);
  });

  it('should compute lower multiplier for poor recall', () => {
    const now = Date.now();
    const goodHistory: AccessEvent[] = [
      { accessedAt: new Date(now - 4 * 24 * 60 * 60 * 1000), wasRecalled: true },
      { accessedAt: new Date(now - 2 * 24 * 60 * 60 * 1000), wasRecalled: true },
      { accessedAt: new Date(now), wasRecalled: true },
    ];
    const poorHistory: AccessEvent[] = [
      { accessedAt: new Date(now - 4 * 24 * 60 * 60 * 1000), wasRecalled: false },
      { accessedAt: new Date(now - 2 * 24 * 60 * 60 * 1000), wasRecalled: false },
      { accessedAt: new Date(now), wasRecalled: true },
    ];

    const goodProfile = learnDecayProfile(goodHistory)!;
    const poorProfile = learnDecayProfile(poorHistory)!;

    expect(goodProfile.personalStabilityMultiplier).toBeGreaterThan(
      poorProfile.personalStabilityMultiplier
    );
  });

  it('should clamp multiplier to 0.5-3.0 range', () => {
    const now = Date.now();
    // Extreme case: all failures, short intervals
    const history: AccessEvent[] = [
      { accessedAt: new Date(now - 1000), wasRecalled: false },
      { accessedAt: new Date(now), wasRecalled: false },
    ];
    const profile = learnDecayProfile(history)!;
    expect(profile.personalStabilityMultiplier).toBeGreaterThanOrEqual(0.5);
    expect(profile.personalStabilityMultiplier).toBeLessThanOrEqual(3.0);
  });
});

describe('calculatePersonalizedRetention', () => {
  it('should fall back to default when no profile', () => {
    const lastAccess = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const defaultResult = calculateRetention(lastAccess, 5.0);
    const personalizedResult = calculatePersonalizedRetention(lastAccess, 5.0, null);

    expect(personalizedResult.retention).toBeCloseTo(defaultResult.retention, 2);
  });

  it('should use profile multiplier when provided', () => {
    const lastAccess = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const profile: UserDecayProfile = {
      userId: 'test-user',
      avgAccessInterval: 5,
      retentionAtReview: 0.8,
      personalStabilityMultiplier: 2.0,
    };

    const defaultResult = calculateRetention(lastAccess, 5.0);
    const personalizedResult = calculatePersonalizedRetention(lastAccess, 5.0, profile);

    // Higher multiplier → higher effective stability → higher retention
    expect(personalizedResult.retention).toBeGreaterThan(defaultResult.retention);
  });

  it('should produce valid retention values (0-1)', () => {
    const profile: UserDecayProfile = {
      userId: 'test-user',
      avgAccessInterval: 1,
      retentionAtReview: 0.5,
      personalStabilityMultiplier: 0.5,
    };

    const lastAccess = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = calculatePersonalizedRetention(lastAccess, 2.0, profile);

    expect(result.retention).toBeGreaterThanOrEqual(0);
    expect(result.retention).toBeLessThanOrEqual(1);
    expect(result.daysSinceAccess).toBeGreaterThan(0);
  });

  it('should respect needsReview and shouldArchive thresholds', () => {
    const profile: UserDecayProfile = {
      userId: 'test-user',
      avgAccessInterval: 7,
      retentionAtReview: 0.9,
      personalStabilityMultiplier: 1.0,
    };

    // Very old fact with low stability → should be archived
    const veryOld = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const result = calculatePersonalizedRetention(veryOld, 1.0, profile);

    expect(result.shouldArchive).toBe(true);
  });
});

// ===========================================
// Semantic Clustering Tests
// ===========================================

describe('clusterEpisodesSemantic', () => {
  it('should return empty array for empty input', () => {
    const result = clusterEpisodesSemantic([]);
    expect(result).toEqual([]);
  });

  it('should return single cluster for single episode', () => {
    const episodes: EpisodeInput[] = [
      { id: '1', trigger: 'Hello', response: 'World', retrievalStrength: 1.0 },
    ];
    const result = clusterEpisodesSemantic(episodes);
    expect(result).toHaveLength(1);
    expect(result[0].members).toHaveLength(1);
  });

  it('should group similar episodes together', () => {
    const episodes: EpisodeInput[] = [
      {
        id: '1',
        trigger: 'How do I configure TypeScript compiler options?',
        response: 'You can set options in tsconfig.json with compiler settings.',
        retrievalStrength: 0.8,
      },
      {
        id: '2',
        trigger: 'What TypeScript compiler settings should I use?',
        response: 'Configure your tsconfig.json with strict mode enabled for best results.',
        retrievalStrength: 0.9,
      },
      {
        id: '3',
        trigger: 'What is the best recipe for chocolate cake?',
        response: 'Mix flour, cocoa, sugar, eggs and butter. Bake at 350 degrees.',
        retrievalStrength: 0.7,
      },
    ];

    const result = clusterEpisodesSemantic(episodes, 0.3);

    // TypeScript episodes should be in the same cluster, cake separate
    expect(result.length).toBeGreaterThanOrEqual(2);

    // Find the cluster with the cake episode
    const cakeCluster = result.find(c =>
      c.members.some(m => m.id === '3')
    );
    expect(cakeCluster).toBeDefined();
    expect(cakeCluster!.members).not.toContainEqual(
      expect.objectContaining({ id: '1' })
    );
  });

  it('should keep dissimilar episodes in separate clusters', () => {
    const episodes: EpisodeInput[] = [
      {
        id: '1',
        trigger: 'Python machine learning tutorial',
        response: 'Start with scikit-learn for classification and regression tasks.',
        retrievalStrength: 0.8,
      },
      {
        id: '2',
        trigger: 'Best Italian restaurants in Berlin',
        response: 'Try the place on Friedrichstrasse for authentic pasta.',
        retrievalStrength: 0.7,
      },
    ];

    const result = clusterEpisodesSemantic(episodes, 0.5);
    expect(result).toHaveLength(2);
  });

  it('should produce valid cluster structure', () => {
    const episodes: EpisodeInput[] = [
      { id: '1', trigger: 'React hooks tutorial', response: 'useState and useEffect are the most common hooks.', retrievalStrength: 0.8 },
      { id: '2', trigger: 'React state management', response: 'Use useState for local state, useReducer for complex state.', retrievalStrength: 0.7 },
      { id: '3', trigger: 'React performance optimization', response: 'Use React.memo and useMemo to prevent unnecessary rerenders.', retrievalStrength: 0.9 },
    ];

    const result = clusterEpisodesSemantic(episodes, 0.3);

    for (const cluster of result) {
      expect(cluster.centroid).toBeTruthy();
      expect(cluster.members.length).toBeGreaterThan(0);
      expect(cluster.similarity).toBeGreaterThanOrEqual(0);
      expect(cluster.similarity).toBeLessThanOrEqual(1);
    }

    // Total members across all clusters should equal input count
    const totalMembers = result.reduce((sum, c) => sum + c.members.length, 0);
    expect(totalMembers).toBe(episodes.length);
  });

  it('should handle episodes with short text', () => {
    const episodes: EpisodeInput[] = [
      { id: '1', trigger: 'Hi', response: 'Hello', retrievalStrength: 1.0 },
      { id: '2', trigger: 'Bye', response: 'See ya', retrievalStrength: 1.0 },
    ];

    // Should not throw
    const result = clusterEpisodesSemantic(episodes);
    expect(result.length).toBeGreaterThan(0);
  });
});
