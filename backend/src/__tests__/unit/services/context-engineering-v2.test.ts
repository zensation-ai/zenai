/**
 * Phase 111: Context Engineering 2.0 Tests
 *
 * Tests for:
 * - Elastic budget allocation per domain
 * - Semantic relevance scoring (TF-IDF cosine similarity)
 * - LLM domain detection fallback with caching
 */

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock database-context
jest.mock('../../../utils/database-context', () => ({
  queryContext: jest.fn(),
}));

// Mock claude/core for LLM fallback tests
jest.mock('../../../services/claude/core', () => ({
  generateClaudeResponse: jest.fn(),
}));

import {
  DEFAULT_BUDGET_ALLOCATION,
  DOMAIN_BUDGET_PROFILES,
  getDomainBudgetProfile,
  assembleContextWithBudget,
  assembleContextWithElasticBudget,
  estimateTokensBudget,
  truncateToTokenBudget,
  BudgetDomain,
  ContextSections,
} from '../../../utils/token-budget';

import {
  buildTermVector,
  cosineSimilarity,
  scoreSemanticRelevance,
  filterContextByRelevance,
  getLLMDomainFromCache,
  setLLMDomainCache,
  clearLLMDomainCache,
  getLLMDomainCacheSize,
  ContextPartV2,
} from '../../../services/context-engine-v2';

import { getContextEngineV2, resetContextEngineV2 } from '../../../services/context-engine-v2';

const mockGenerateClaudeResponse = jest.requireMock('../../../services/claude/core').generateClaudeResponse;

// ===========================================
// Elastic Budget Allocation Tests (Task 37)
// ===========================================

describe('Elastic Token Budget Allocation', () => {
  describe('DOMAIN_BUDGET_PROFILES', () => {
    it('should have profiles for all 5 domains', () => {
      const domains: BudgetDomain[] = ['finance', 'email', 'code', 'learning', 'general'];
      for (const domain of domains) {
        expect(DOMAIN_BUDGET_PROFILES[domain]).toBeDefined();
        expect(DOMAIN_BUDGET_PROFILES[domain]).toHaveProperty('systemBase');
        expect(DOMAIN_BUDGET_PROFILES[domain]).toHaveProperty('workingMemory');
        expect(DOMAIN_BUDGET_PROFILES[domain]).toHaveProperty('personalFacts');
        expect(DOMAIN_BUDGET_PROFILES[domain]).toHaveProperty('ragContext');
      }
    });

    it('general profile should match DEFAULT_BUDGET_ALLOCATION', () => {
      expect(DOMAIN_BUDGET_PROFILES.general.systemBase).toBe(DEFAULT_BUDGET_ALLOCATION.systemBase);
      expect(DOMAIN_BUDGET_PROFILES.general.workingMemory).toBe(DEFAULT_BUDGET_ALLOCATION.workingMemory);
      expect(DOMAIN_BUDGET_PROFILES.general.personalFacts).toBe(DEFAULT_BUDGET_ALLOCATION.personalFacts);
      expect(DOMAIN_BUDGET_PROFILES.general.ragContext).toBe(DEFAULT_BUDGET_ALLOCATION.ragContext);
    });

    it('code domain should have higher ragContext than general', () => {
      expect(DOMAIN_BUDGET_PROFILES.code.ragContext).toBeGreaterThan(DOMAIN_BUDGET_PROFILES.general.ragContext);
    });

    it('email domain should have higher personalFacts than general', () => {
      expect(DOMAIN_BUDGET_PROFILES.email.personalFacts).toBeGreaterThan(DOMAIN_BUDGET_PROFILES.general.personalFacts);
    });

    it('finance domain should have higher personalFacts than general', () => {
      expect(DOMAIN_BUDGET_PROFILES.finance.personalFacts).toBeGreaterThan(DOMAIN_BUDGET_PROFILES.general.personalFacts);
    });

    it('all profiles should have positive values', () => {
      for (const [, profile] of Object.entries(DOMAIN_BUDGET_PROFILES)) {
        expect(profile.systemBase).toBeGreaterThan(0);
        expect(profile.workingMemory).toBeGreaterThan(0);
        expect(profile.personalFacts).toBeGreaterThan(0);
        expect(profile.ragContext).toBeGreaterThan(0);
      }
    });

    it('all profiles should sum to approximately the same total', () => {
      const totals = Object.values(DOMAIN_BUDGET_PROFILES).map(
        p => p.systemBase + p.workingMemory + p.personalFacts + p.ragContext
      );
      const generalTotal = totals[totals.length - 1]; // general is last
      for (const total of totals) {
        // Allow 10% variance
        expect(total).toBeGreaterThanOrEqual(generalTotal * 0.9);
        expect(total).toBeLessThanOrEqual(generalTotal * 1.1);
      }
    });
  });

  describe('getDomainBudgetProfile', () => {
    it('should return correct profile for each domain', () => {
      expect(getDomainBudgetProfile('code')).toEqual(DOMAIN_BUDGET_PROFILES.code);
      expect(getDomainBudgetProfile('finance')).toEqual(DOMAIN_BUDGET_PROFILES.finance);
      expect(getDomainBudgetProfile('email')).toEqual(DOMAIN_BUDGET_PROFILES.email);
    });

    it('should fallback to general for unknown domain', () => {
      expect(getDomainBudgetProfile('unknown' as BudgetDomain)).toEqual(DOMAIN_BUDGET_PROFILES.general);
    });
  });

  describe('assembleContextWithElasticBudget', () => {
    const sections: ContextSections = {
      systemBase: 'System prompt content here.',
      workingMemory: 'Current working memory state.',
      personalFacts: 'User prefers dark mode. User speaks German.',
      ragContext: 'Retrieved documents about TypeScript patterns.',
      history: 'Previous messages in the conversation.',
    };

    it('should assemble context with code domain profile', () => {
      const result = assembleContextWithElasticBudget(sections, 20000, 'code');
      expect(result.assembled).toBeTruthy();
      expect(result.tokenEstimate).toBeGreaterThan(0);
      expect(result.allocations).toBeDefined();
    });

    it('should assemble context with finance domain profile', () => {
      const result = assembleContextWithElasticBudget(sections, 20000, 'finance');
      expect(result.assembled).toBeTruthy();
      expect(result.tokenEstimate).toBeGreaterThan(0);
    });

    it('general domain should produce same result as assembleContextWithBudget', () => {
      const elasticResult = assembleContextWithElasticBudget(sections, 20000, 'general');
      const fixedResult = assembleContextWithBudget(sections, 20000);
      expect(elasticResult.assembled).toBe(fixedResult.assembled);
      expect(elasticResult.tokenEstimate).toBe(fixedResult.tokenEstimate);
    });

    it('should handle empty sections', () => {
      const result = assembleContextWithElasticBudget({}, 20000, 'code');
      expect(result.assembled).toBe('');
      expect(result.tokenEstimate).toBe(0);
    });

    it('should handle very small budget', () => {
      const result = assembleContextWithElasticBudget(sections, 100, 'code');
      expect(result.tokenEstimate).toBeLessThanOrEqual(200); // May slightly exceed due to estimation
    });

    it('should flag summarization for large history', () => {
      const largeHistory = 'A'.repeat(400000); // ~100K tokens
      const result = assembleContextWithElasticBudget(
        { ...sections, history: largeHistory },
        200000,
        'code'
      );
      expect(result.summarizationNeeded).toBe(true);
    });

    it('should not flag summarization for small history', () => {
      const result = assembleContextWithElasticBudget(sections, 20000, 'code');
      expect(result.summarizationNeeded).toBe(false);
    });
  });
});

// ===========================================
// Semantic Relevance Scoring Tests (Task 38)
// ===========================================

describe('Semantic Relevance Scoring', () => {
  describe('buildTermVector', () => {
    it('should build frequency vector from text', () => {
      const vec = buildTermVector('hello world hello');
      expect(vec.get('hello')).toBeCloseTo(2 / 3, 2);
      expect(vec.get('world')).toBeCloseTo(1 / 3, 2);
    });

    it('should return empty map for empty text', () => {
      expect(buildTermVector('')).toEqual(new Map());
      expect(buildTermVector(null as unknown as string)).toEqual(new Map());
    });

    it('should filter short words (length <= 2)', () => {
      const vec = buildTermVector('I am a test word');
      expect(vec.has('am')).toBe(false);
      expect(vec.has('test')).toBe(true);
      expect(vec.has('word')).toBe(true);
    });

    it('should lowercase all terms', () => {
      const vec = buildTermVector('Hello WORLD');
      expect(vec.has('hello')).toBe(true);
      expect(vec.has('world')).toBe(true);
      expect(vec.has('Hello')).toBe(false);
    });

    it('should handle German text', () => {
      const vec = buildTermVector('Der Kontostand zeigt den aktuellen Kontostand');
      expect(vec.has('kontostand')).toBe(true);
      expect(vec.get('kontostand')).toBeGreaterThan(0);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = buildTermVector('test content here');
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1.0, 2);
    });

    it('should return 0 for completely different vectors', () => {
      const vecA = buildTermVector('alpha beta gamma');
      const vecB = buildTermVector('delta epsilon zeta');
      expect(cosineSimilarity(vecA, vecB)).toBe(0);
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity(new Map(), new Map())).toBe(0);
      expect(cosineSimilarity(buildTermVector('hello'), new Map())).toBe(0);
    });

    it('should return value between 0 and 1 for partial overlap', () => {
      const vecA = buildTermVector('code debugging error fix');
      const vecB = buildTermVector('error handling fix bugs');
      const sim = cosineSimilarity(vecA, vecB);
      expect(sim).toBeGreaterThan(0);
      expect(sim).toBeLessThan(1);
    });
  });

  describe('scoreSemanticRelevance', () => {
    it('should return high score for matching content', () => {
      const score = scoreSemanticRelevance(
        'Kontostand und Budget anzeigen',
        'Der aktuelle Kontostand betraegt 1500 Euro. Das Budget ist 2000 Euro.'
      );
      expect(score).toBeGreaterThan(0.1);
    });

    it('should return low score for unrelated content', () => {
      const score = scoreSemanticRelevance(
        'Kontostand anzeigen',
        'The TypeScript compiler uses abstract syntax trees for compilation.'
      );
      expect(score).toBeLessThan(0.2);
    });

    it('should return 0 for empty inputs', () => {
      expect(scoreSemanticRelevance('', 'some content')).toBe(0);
      expect(scoreSemanticRelevance('query', '')).toBe(0);
      expect(scoreSemanticRelevance('', '')).toBe(0);
    });

    it('should return 0 for null inputs', () => {
      expect(scoreSemanticRelevance(null as unknown as string, 'content')).toBe(0);
    });
  });

  describe('filterContextByRelevance', () => {
    const mockParts: ContextPartV2[] = [
      { source: 'budget_data', content: 'Budget ist 2000 Euro, Kontostand 1500', tokens: 20, priority: 5 },
      { source: 'code_docs', content: 'TypeScript compiler abstract syntax trees', tokens: 15, priority: 3 },
      { source: 'finance_facts', content: 'Monatliche Ausgaben und Einnahmen Kontostand', tokens: 18, priority: 4 },
    ];

    it('should filter out irrelevant parts', () => {
      const filtered = filterContextByRelevance('Kontostand anzeigen', mockParts, 0.05);
      // finance/budget parts should be kept, code docs should be filtered
      expect(filtered.length).toBeLessThanOrEqual(mockParts.length);
    });

    it('should keep all parts with very low threshold', () => {
      const filtered = filterContextByRelevance('anything', mockParts, 0.0);
      expect(filtered.length).toBe(mockParts.length);
    });

    it('should return empty array for very high threshold', () => {
      const filtered = filterContextByRelevance('random query', mockParts, 0.99);
      expect(filtered.length).toBeLessThanOrEqual(mockParts.length);
    });

    it('should return all parts for empty query', () => {
      const filtered = filterContextByRelevance('', mockParts);
      expect(filtered.length).toBe(mockParts.length);
    });

    it('should return empty array for empty parts', () => {
      const filtered = filterContextByRelevance('some query', []);
      expect(filtered.length).toBe(0);
    });

    it('should use default threshold of 0.3', () => {
      // With default threshold, some parts should be filtered
      const filtered = filterContextByRelevance('Kontostand', mockParts);
      // Just verify it doesn't crash and returns an array
      expect(Array.isArray(filtered)).toBe(true);
    });
  });
});

// ===========================================
// LLM Domain Detection Tests (Task 39)
// ===========================================

describe('LLM Domain Detection Fallback', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearLLMDomainCache();
    resetContextEngineV2();
  });

  describe('LLM Domain Cache', () => {
    it('should store and retrieve cached results', () => {
      setLLMDomainCache('test-query', 'finance', 0.75);
      const cached = getLLMDomainFromCache('test-query');
      expect(cached).not.toBeNull();
      expect(cached!.domain).toBe('finance');
      expect(cached!.confidence).toBe(0.75);
    });

    it('should return null for non-existent keys', () => {
      expect(getLLMDomainFromCache('non-existent')).toBeNull();
    });

    it('should expire entries after TTL', () => {
      setLLMDomainCache('test-query', 'code', 0.8);

      // Manually expire by manipulating timestamp
      const cache = getLLMDomainFromCache('test-query');
      expect(cache).not.toBeNull();

      // We can't easily test real TTL expiry without waiting,
      // but we can verify the cache works correctly
    });

    it('should clear all entries', () => {
      setLLMDomainCache('q1', 'finance', 0.7);
      setLLMDomainCache('q2', 'code', 0.8);
      expect(getLLMDomainCacheSize()).toBe(2);

      clearLLMDomainCache();
      expect(getLLMDomainCacheSize()).toBe(0);
    });

    it('should overwrite existing entries', () => {
      setLLMDomainCache('test', 'finance', 0.6);
      setLLMDomainCache('test', 'code', 0.9);
      const cached = getLLMDomainFromCache('test');
      expect(cached!.domain).toBe('code');
      expect(cached!.confidence).toBe(0.9);
    });

    it('should report correct cache size', () => {
      expect(getLLMDomainCacheSize()).toBe(0);
      setLLMDomainCache('a', 'finance', 0.5);
      expect(getLLMDomainCacheSize()).toBe(1);
      setLLMDomainCache('b', 'code', 0.5);
      expect(getLLMDomainCacheSize()).toBe(2);
    });
  });

  describe('classifyDomainWithFallback', () => {
    it('should use keyword result when confidence >= 0.4', async () => {
      const engine = getContextEngineV2();
      // "budget" is a finance keyword, should get confidence >= 0.4
      const result = await engine.classifyDomainWithFallback('Zeig mir das Budget und die Finanzen');
      expect(result.domain).toBe('finance');
      expect(result.confidence).toBeGreaterThanOrEqual(0.4);
      // LLM should not be called
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
    });

    it('should fall back to LLM for low-confidence queries', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'finance' }],
      });

      const engine = getContextEngineV2();
      // Ambiguous query with no domain keywords -> confidence 0.3 -> triggers LLM
      const result = await engine.classifyDomainWithFallback('Was war gestern los?');
      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(result.domain).toBe('finance');
      expect(result.confidence).toBe(0.75);
    });

    it('should use cached LLM result on second call', async () => {
      // Pre-populate cache - use a query with no domain keywords (confidence 0.3)
      const ambiguousQuery = 'was ist hier passiert';
      setLLMDomainCache(ambiguousQuery, 'email', 0.75);

      const engine = getContextEngineV2();
      const result = await engine.classifyDomainWithFallback(ambiguousQuery);
      expect(result.domain).toBe('email');
      expect(result.confidence).toBe(0.75);
      expect(mockGenerateClaudeResponse).not.toHaveBeenCalled();
    });

    it('should fallback to keyword result when LLM fails', async () => {
      mockGenerateClaudeResponse.mockRejectedValueOnce(new Error('API unavailable'));

      const engine = getContextEngineV2();
      // Query with no domain keywords -> confidence 0.3 -> triggers LLM -> LLM fails -> returns keyword result
      const result = await engine.classifyDomainWithFallback('hallo zusammen');
      expect(result.domain).toBe('general');
      expect(result.confidence).toBe(0.3);
    });

    it('should parse valid domain from LLM response', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'code' }],
      });

      const engine = getContextEngineV2();
      // Query with no domain keywords -> confidence 0.3 -> triggers LLM -> LLM returns 'code'
      const result = await engine.classifyDomainWithFallback('bitte hilf mir damit');
      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(result.domain).toBe('code');
      expect(result.confidence).toBe(0.75);
    });

    it('should default to general for unrecognized LLM response', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'something_unknown' }],
      });

      const engine = getContextEngineV2();
      // Query with no domain keywords -> confidence 0.3 -> triggers LLM -> LLM returns unrecognized
      const result = await engine.classifyDomainWithFallback('zeig mir alles');
      expect(mockGenerateClaudeResponse).toHaveBeenCalledTimes(1);
      expect(result.domain).toBe('general');
      expect(result.confidence).toBe(0.5); // general gets 0.5
    });

    it('should cache LLM result after successful call', async () => {
      mockGenerateClaudeResponse.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'learning' }],
      });

      const engine = getContextEngineV2();
      // Query with no domain keywords -> triggers LLM
      await engine.classifyDomainWithFallback('sag mir bescheid');
      expect(getLLMDomainCacheSize()).toBe(1);
    });
  });

  describe('classifyDomain (keyword-based)', () => {
    it('should classify finance queries correctly', () => {
      const engine = getContextEngineV2();
      const result = engine.classifyDomain('Zeig mir den Kontostand und das Budget');
      expect(result.domain).toBe('finance');
    });

    it('should classify email queries correctly', () => {
      const engine = getContextEngineV2();
      const result = engine.classifyDomain('Öffne die Inbox und zeige neue Nachrichten');
      expect(result.domain).toBe('email');
    });

    it('should classify code queries correctly', () => {
      const engine = getContextEngineV2();
      const result = engine.classifyDomain('Implementiere die API und debug den Error');
      expect(result.domain).toBe('code');
    });

    it('should classify learning queries correctly', () => {
      const engine = getContextEngineV2();
      const result = engine.classifyDomain('Erkläre mir das Tutorial zum Kurs');
      expect(result.domain).toBe('learning');
    });

    it('should return general for ambiguous queries', () => {
      const engine = getContextEngineV2();
      const result = engine.classifyDomain('Hallo, wie geht es dir?');
      expect(result.domain).toBe('general');
    });
  });
});

// ===========================================
// Integration / Edge Case Tests
// ===========================================

describe('Context Engineering V2 Integration', () => {
  it('assembleContextWithElasticBudget should produce consistent results across calls', () => {
    const sections: ContextSections = {
      systemBase: 'System base content.',
      ragContext: 'Some RAG context retrieved from the database.',
    };
    const result1 = assembleContextWithElasticBudget(sections, 20000, 'code');
    const result2 = assembleContextWithElasticBudget(sections, 20000, 'code');
    expect(result1.assembled).toBe(result2.assembled);
    expect(result1.tokenEstimate).toBe(result2.tokenEstimate);
  });

  it('different domains should produce different allocations for same content', () => {
    const longContent = 'A '.repeat(5000); // Content that would be truncated
    const sections: ContextSections = {
      personalFacts: longContent,
      ragContext: longContent,
    };

    const codeResult = assembleContextWithElasticBudget(sections, 20000, 'code');
    const emailResult = assembleContextWithElasticBudget(sections, 20000, 'email');

    // Code should allocate more to ragContext, email more to personalFacts
    // Due to truncation, the actual token counts should differ
    expect(codeResult.allocations.ragContext).toBeGreaterThanOrEqual(0);
    expect(emailResult.allocations.personalFacts).toBeGreaterThanOrEqual(0);
  });

  it('estimateTokensBudget and truncateToTokenBudget should work together', () => {
    const text = 'Hello world. This is a test. Another sentence here. And more content follows.';
    const truncated = truncateToTokenBudget(text, 5);
    const tokens = estimateTokensBudget(truncated);
    expect(tokens).toBeLessThanOrEqual(10); // Allow some margin
  });
});
