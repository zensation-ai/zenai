/**
 * Tests for Phase 136: Capability Model
 *
 * TDD: Tests written before implementation.
 * Covers computeDomainCapability, identifyStrengths, identifyWeaknesses,
 * computeImprovementTrend, buildCapabilityProfile, recordInteraction,
 * loadCapabilityProfile, evaluateResponse.
 */

jest.mock('../../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

import {
  computeDomainCapability,
  identifyStrengths,
  identifyWeaknesses,
  computeImprovementTrend,
  buildCapabilityProfile,
  recordInteraction,
  loadCapabilityProfile,
  evaluateResponse,
} from '../../../../services/metacognition/capability-model';
import type {
  DomainCapability,
  CapabilityProfile,
} from '../../../../services/metacognition/capability-model';
import { queryContext } from '../../../../utils/database-context';
import { logger } from '../../../../utils/logger';

const mockQueryContext = queryContext as jest.MockedFunction<typeof queryContext>;

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryContext.mockReset();
});

// ---------------------------------------------------------------------------
// computeDomainCapability
// ---------------------------------------------------------------------------

describe('computeDomainCapability', () => {
  it('computes querySuccessRate from positive/total', () => {
    const result = computeDomainCapability('finance', {
      factCount: 50,
      totalQueries: 100,
      positiveQueries: 75,
      avgConfidence: 0.8,
    });
    expect(result.domain).toBe('finance');
    expect(result.factCount).toBe(50);
    expect(result.totalQueries).toBe(100);
    expect(result.positiveQueries).toBe(75);
    expect(result.querySuccessRate).toBeCloseTo(0.75);
    expect(result.avgConfidence).toBeCloseTo(0.8);
  });

  it('returns 0 success rate when no queries', () => {
    const result = computeDomainCapability('science', {
      factCount: 10,
      totalQueries: 0,
      positiveQueries: 0,
      avgConfidence: 0.5,
    });
    expect(result.querySuccessRate).toBe(0);
    expect(result.totalQueries).toBe(0);
  });

  it('returns 1.0 when all queries positive', () => {
    const result = computeDomainCapability('code', {
      factCount: 20,
      totalQueries: 30,
      positiveQueries: 30,
      avgConfidence: 0.9,
    });
    expect(result.querySuccessRate).toBeCloseTo(1.0);
  });

  it('returns 0.0 when all queries negative', () => {
    const result = computeDomainCapability('art', {
      factCount: 5,
      totalQueries: 10,
      positiveQueries: 0,
      avgConfidence: 0.3,
    });
    expect(result.querySuccessRate).toBeCloseTo(0.0);
  });
});

// ---------------------------------------------------------------------------
// identifyStrengths
// ---------------------------------------------------------------------------

describe('identifyStrengths', () => {
  const domains: Record<string, DomainCapability> = {
    finance: { domain: 'finance', factCount: 50, avgConfidence: 0.8, querySuccessRate: 0.85, totalQueries: 100, positiveQueries: 85 },
    code: { domain: 'code', factCount: 30, avgConfidence: 0.9, querySuccessRate: 0.95, totalQueries: 80, positiveQueries: 76 },
    art: { domain: 'art', factCount: 10, avgConfidence: 0.4, querySuccessRate: 0.3, totalQueries: 20, positiveQueries: 6 },
    science: { domain: 'science', factCount: 15, avgConfidence: 0.6, querySuccessRate: 0.55, totalQueries: 40, positiveQueries: 22 },
  };

  it('identifies domains above default threshold (0.7)', () => {
    const strengths = identifyStrengths(domains);
    expect(strengths).toContain('finance');
    expect(strengths).toContain('code');
    expect(strengths).not.toContain('art');
    expect(strengths).not.toContain('science');
  });

  it('returns empty array when none above threshold', () => {
    const weak: Record<string, DomainCapability> = {
      art: { domain: 'art', factCount: 5, avgConfidence: 0.3, querySuccessRate: 0.2, totalQueries: 10, positiveQueries: 2 },
    };
    expect(identifyStrengths(weak)).toEqual([]);
  });

  it('returns all when all above threshold', () => {
    const strong: Record<string, DomainCapability> = {
      a: { domain: 'a', factCount: 10, avgConfidence: 0.9, querySuccessRate: 0.9, totalQueries: 50, positiveQueries: 45 },
      b: { domain: 'b', factCount: 10, avgConfidence: 0.8, querySuccessRate: 0.8, totalQueries: 50, positiveQueries: 40 },
    };
    const strengths = identifyStrengths(strong);
    expect(strengths).toHaveLength(2);
    expect(strengths).toContain('a');
    expect(strengths).toContain('b');
  });

  it('uses custom threshold', () => {
    const strengths = identifyStrengths(domains, 0.5);
    expect(strengths).toContain('finance');
    expect(strengths).toContain('code');
    expect(strengths).toContain('science');
    expect(strengths).not.toContain('art');
  });
});

// ---------------------------------------------------------------------------
// identifyWeaknesses
// ---------------------------------------------------------------------------

describe('identifyWeaknesses', () => {
  const domains: Record<string, DomainCapability> = {
    finance: { domain: 'finance', factCount: 50, avgConfidence: 0.8, querySuccessRate: 0.85, totalQueries: 100, positiveQueries: 85 },
    art: { domain: 'art', factCount: 10, avgConfidence: 0.4, querySuccessRate: 0.3, totalQueries: 20, positiveQueries: 6 },
    history: { domain: 'history', factCount: 3, avgConfidence: 0.2, querySuccessRate: 0.1, totalQueries: 10, positiveQueries: 1 },
    science: { domain: 'science', factCount: 15, avgConfidence: 0.6, querySuccessRate: 0.55, totalQueries: 40, positiveQueries: 22 },
  };

  it('identifies domains below default threshold (0.4)', () => {
    const weaknesses = identifyWeaknesses(domains);
    expect(weaknesses).toContain('art');
    expect(weaknesses).toContain('history');
    expect(weaknesses).not.toContain('finance');
    expect(weaknesses).not.toContain('science');
  });

  it('returns empty array when none below threshold', () => {
    const strong: Record<string, DomainCapability> = {
      a: { domain: 'a', factCount: 10, avgConfidence: 0.9, querySuccessRate: 0.9, totalQueries: 50, positiveQueries: 45 },
    };
    expect(identifyWeaknesses(strong)).toEqual([]);
  });

  it('returns all when all below threshold', () => {
    const weak: Record<string, DomainCapability> = {
      a: { domain: 'a', factCount: 2, avgConfidence: 0.1, querySuccessRate: 0.1, totalQueries: 10, positiveQueries: 1 },
      b: { domain: 'b', factCount: 1, avgConfidence: 0.2, querySuccessRate: 0.2, totalQueries: 5, positiveQueries: 1 },
    };
    const weaknesses = identifyWeaknesses(weak);
    expect(weaknesses).toHaveLength(2);
  });

  it('uses custom threshold', () => {
    const weaknesses = identifyWeaknesses(domains, 0.6);
    expect(weaknesses).toContain('art');
    expect(weaknesses).toContain('history');
    expect(weaknesses).toContain('science');
    expect(weaknesses).not.toContain('finance');
  });
});

// ---------------------------------------------------------------------------
// computeImprovementTrend
// ---------------------------------------------------------------------------

describe('computeImprovementTrend', () => {
  it('returns positive value when improving', () => {
    const trend = computeImprovementTrend([4, 5, 4.5], [2, 3, 2.5]);
    expect(trend).toBeGreaterThan(0);
    // avg(recent)=4.5, avg(older)=2.5, diff=2.0, clamped to 1
    expect(trend).toBe(1);
  });

  it('returns negative value when declining', () => {
    const trend = computeImprovementTrend([1, 2, 1.5], [4, 5, 4.5]);
    expect(trend).toBeLessThan(0);
  });

  it('returns 0 when stable', () => {
    const trend = computeImprovementTrend([3, 3, 3], [3, 3, 3]);
    expect(trend).toBeCloseTo(0);
  });

  it('returns 0 for empty recent scores', () => {
    const trend = computeImprovementTrend([], [3, 4]);
    expect(trend).toBe(0);
  });

  it('returns 0 for empty older scores', () => {
    const trend = computeImprovementTrend([3, 4], []);
    expect(trend).toBe(0);
  });

  it('returns 0 when both arrays empty', () => {
    const trend = computeImprovementTrend([], []);
    expect(trend).toBe(0);
  });

  it('clamps to 1 when difference exceeds 1', () => {
    const trend = computeImprovementTrend([5, 5, 5], [0, 0, 0]);
    expect(trend).toBe(1);
  });

  it('clamps to -1 when difference below -1', () => {
    const trend = computeImprovementTrend([0, 0, 0], [5, 5, 5]);
    expect(trend).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// buildCapabilityProfile
// ---------------------------------------------------------------------------

describe('buildCapabilityProfile', () => {
  it('assembles a full profile', () => {
    const domains: Record<string, DomainCapability> = {
      finance: { domain: 'finance', factCount: 50, avgConfidence: 0.8, querySuccessRate: 0.85, totalQueries: 100, positiveQueries: 85 },
      art: { domain: 'art', factCount: 10, avgConfidence: 0.4, querySuccessRate: 0.3, totalQueries: 20, positiveQueries: 6 },
    };

    const profile = buildCapabilityProfile(domains, 120, [4, 5], [3, 3]);

    expect(profile.domains).toBe(domains);
    expect(profile.totalInteractions).toBe(120);
    expect(profile.strengths).toContain('finance');
    expect(profile.weaknesses).toContain('art');
    expect(profile.improvementTrend).toBeGreaterThan(0);
    expect(profile.avgResponseQuality).toBeGreaterThanOrEqual(0);
    expect(profile.avgResponseQuality).toBeLessThanOrEqual(5);
  });

  it('handles empty domains', () => {
    const profile = buildCapabilityProfile({}, 0, [], []);

    expect(profile.domains).toEqual({});
    expect(profile.strengths).toEqual([]);
    expect(profile.weaknesses).toEqual([]);
    expect(profile.totalInteractions).toBe(0);
    expect(profile.improvementTrend).toBe(0);
  });

  it('correctly identifies strengths and weaknesses', () => {
    const domains: Record<string, DomainCapability> = {
      strong: { domain: 'strong', factCount: 100, avgConfidence: 0.95, querySuccessRate: 0.9, totalQueries: 200, positiveQueries: 180 },
      weak: { domain: 'weak', factCount: 2, avgConfidence: 0.2, querySuccessRate: 0.1, totalQueries: 10, positiveQueries: 1 },
      mid: { domain: 'mid', factCount: 20, avgConfidence: 0.6, querySuccessRate: 0.55, totalQueries: 40, positiveQueries: 22 },
    };

    const profile = buildCapabilityProfile(domains, 250, [3], [3]);
    expect(profile.strengths).toEqual(['strong']);
    expect(profile.weaknesses).toEqual(['weak']);
  });
});

// ---------------------------------------------------------------------------
// recordInteraction
// ---------------------------------------------------------------------------

describe('recordInteraction', () => {
  it('writes interaction to database', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await recordInteraction('personal', 'finance', true, 4.5);

    expect(mockQueryContext).toHaveBeenCalledTimes(1);
    expect(mockQueryContext).toHaveBeenCalledWith(
      'personal',
      expect.stringContaining('INSERT'),
      expect.arrayContaining(['finance', true, 4.5]),
    );
  });

  it('does not throw on DB error (fire-and-forget)', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('DB down'));

    await expect(
      recordInteraction('personal', 'code', false),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
  });

  it('uses null quality when not provided', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    await recordInteraction('work', 'science', true);

    expect(mockQueryContext).toHaveBeenCalledWith(
      'work',
      expect.stringContaining('INSERT'),
      expect.arrayContaining(['science', true, null]),
    );
  });
});

// ---------------------------------------------------------------------------
// loadCapabilityProfile
// ---------------------------------------------------------------------------

describe('loadCapabilityProfile', () => {
  it('loads full profile from DB', async () => {
    // First query: domain stats
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { domain: 'finance', fact_count: '50', total_queries: '100', positive_queries: '80', avg_confidence: '0.85' },
        { domain: 'code', fact_count: '30', total_queries: '40', positive_queries: '10', avg_confidence: '0.4' },
      ],
    } as any);
    // Second query: total interactions
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ total: '140' }],
    } as any);
    // Third query: recent scores
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ quality: '4.0' }, { quality: '4.5' }],
    } as any);
    // Fourth query: older scores
    mockQueryContext.mockResolvedValueOnce({
      rows: [{ quality: '3.0' }, { quality: '3.5' }],
    } as any);

    const profile = await loadCapabilityProfile('personal');

    expect(profile.domains).toHaveProperty('finance');
    expect(profile.domains).toHaveProperty('code');
    expect(profile.domains['finance'].querySuccessRate).toBeCloseTo(0.8);
    expect(profile.totalInteractions).toBe(140);
    expect(profile.strengths).toContain('finance');
    expect(profile.weaknesses).toContain('code');
    expect(profile.improvementTrend).toBeGreaterThan(0);
  });

  it('returns default profile when DB is empty', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [{ total: '0' }] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const profile = await loadCapabilityProfile('personal');

    expect(profile.domains).toEqual({});
    expect(profile.totalInteractions).toBe(0);
    expect(profile.strengths).toEqual([]);
    expect(profile.weaknesses).toEqual([]);
    expect(profile.improvementTrend).toBe(0);
  });

  it('returns default profile on DB error', async () => {
    mockQueryContext.mockRejectedValueOnce(new Error('connection failed'));

    const profile = await loadCapabilityProfile('personal');

    expect(profile.domains).toEqual({});
    expect(profile.totalInteractions).toBe(0);
    expect(profile.strengths).toEqual([]);
    expect(profile.weaknesses).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// evaluateResponse
// ---------------------------------------------------------------------------

describe('evaluateResponse', () => {
  it('warns when coverage is below 0.5', async () => {
    // Load profile: no domain data needed, just needs to resolve
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [{ total: '0' }] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await evaluateResponse('personal', {
      domain: 'finance',
      confidence: 0.9,
      hadConflicts: false,
      coverageRatio: 0.3,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.message).toBeDefined();
    expect(result.message).toContain('coverage');
  });

  it('warns when domain is weakness and confidence < 0.5', async () => {
    // Domain stats: code has low success rate
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { domain: 'code', fact_count: '5', total_queries: '20', positive_queries: '4', avg_confidence: '0.3' },
      ],
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [{ total: '20' }] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await evaluateResponse('personal', {
      domain: 'code',
      confidence: 0.3,
      hadConflicts: false,
      coverageRatio: 0.7,
    });

    expect(result.shouldWarn).toBe(true);
    expect(result.message).toBeDefined();
  });

  it('does not warn on strong domain with good coverage', async () => {
    mockQueryContext.mockResolvedValueOnce({
      rows: [
        { domain: 'finance', fact_count: '100', total_queries: '200', positive_queries: '180', avg_confidence: '0.9' },
      ],
    } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [{ total: '200' }] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await evaluateResponse('personal', {
      domain: 'finance',
      confidence: 0.85,
      hadConflicts: false,
      coverageRatio: 0.8,
    });

    expect(result.shouldWarn).toBe(false);
    expect(result.message).toBeUndefined();
  });

  it('does not warn on unknown domain with good coverage and confidence', async () => {
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [{ total: '0' }] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
    mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

    const result = await evaluateResponse('personal', {
      domain: 'unknown_domain',
      confidence: 0.8,
      hadConflicts: false,
      coverageRatio: 0.7,
    });

    expect(result.shouldWarn).toBe(false);
  });
});
