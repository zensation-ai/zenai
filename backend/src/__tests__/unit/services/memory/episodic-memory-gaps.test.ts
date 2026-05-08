/**
 * Gap Coverage Tests for Episodic Memory Service
 *
 * Targets untested paths: edge cases for store/retrieve/consolidate/
 * temporalMerge/applyDecay/getStats, concurrent operations, and
 * parseEmbedding/rowToEpisode edge cases.
 *
 * @module tests/unit/services/memory/episodic-memory-gaps
 */

import { EpisodicMemoryService, Episode } from '../../../../services/memory/episodic-memory';

// Mock dependencies
const mockQueryContext = jest.fn();
jest.mock('../../../../utils/database-context', () => ({
  queryContext: (...args: unknown[]) => mockQueryContext(...args),
}));

const mockGenerateEmbedding = jest.fn();
jest.mock('../../../../services/ai', () => ({
  generateEmbedding: (...args: unknown[]) => mockGenerateEmbedding(...args),
}));

jest.mock('../../../../utils/embedding', () => ({
  formatForPgVector: jest.fn().mockReturnValue('[0.1,0.2,0.3]'),
}));

const mockExtractFacts = jest.fn();
jest.mock('../../../../services/memory/llm-consolidation', () => ({
  extractFactsFromEpisodes: (...args: unknown[]) => mockExtractFacts(...args),
}));

jest.mock('../../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-gap-001'),
}));

describe('EpisodicMemoryService - Gap Coverage', () => {
  let service: EpisodicMemoryService;

  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'ep-gap-001',
    context: 'operations',
    session_id: 'sess-gap-001',
    trigger: 'Gap trigger',
    response: 'Gap response',
    emotional_valence: 0.0,
    emotional_arousal: 0.3,
    time_of_day: 'morning',
    day_of_week: 'Monday',
    is_weekend: false,
    linked_episodes: [],
    linked_facts: [],
    retrieval_count: 0,
    last_retrieved: null,
    retrieval_strength: 1.0,
    created_at: '2026-03-01T10:00:00Z',
    updated_at: '2026-03-01T10:00:00Z',
    ...overrides,
  });

  const makeEpisode = (overrides: Partial<Episode> = {}): Episode => ({
    id: 'e-gap-1',
    context: 'operations' as const,
    sessionId: 's1',
    timestamp: new Date(),
    trigger: 'Q',
    response: 'A',
    emotionalValence: 0,
    emotionalArousal: 0.5,
    temporalContext: { timeOfDay: 'morning', dayOfWeek: 'Monday', isWeekend: false },
    linkedEpisodes: [],
    linkedFacts: [],
    retrievalCount: 0,
    lastRetrieved: null,
    retrievalStrength: 1.0,
    ...overrides,
  });

  beforeEach(() => {
    service = new EpisodicMemoryService();
    jest.clearAllMocks();
    mockGenerateEmbedding.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  // ===========================================
  // store() — Edge Cases
  // ===========================================

  describe('store — edge cases', () => {
    it('should store episode with empty trigger string', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // findSimilar
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ trigger: '' })],
      } as any);

      const result = await service.store('', 'response text', 'sess-1', 'operations');

      expect(result).toBeDefined();
      expect(result.trigger).toBe('');
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(' response text');
    });

    it('should store episode with empty response string', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ response: '' })],
      } as any);

      const result = await service.store('trigger text', '', 'sess-1', 'operations');

      expect(result).toBeDefined();
      expect(mockGenerateEmbedding).toHaveBeenCalledWith('trigger text ');
    });

    it('should store episode with very long text', async () => {
      const longText = 'x'.repeat(10000);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ trigger: longText })],
      } as any);

      const result = await service.store(longText, 'short', 'sess-1', 'operations');

      expect(result).toBeDefined();
      expect(mockGenerateEmbedding).toHaveBeenCalledWith(`${longText} short`);
    });

    it('should handle findSimilarEpisodes DB failure gracefully during store', async () => {
      // findSimilarEpisodes throws - caught internally, returns []
      mockQueryContext.mockRejectedValueOnce(new Error('Similarity search failed'));
      // INSERT still succeeds
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ linked_episodes: [] })],
      } as any);

      const result = await service.store('question', 'answer', 'sess-1', 'operations');

      expect(result).toBeDefined();
      expect(result.linkedEpisodes).toEqual([]);
    });

    it('should handle store across different contexts', async () => {
      for (const ctx of ['operations', 'finance', 'people', 'strategy'] as const) {
        mockQueryContext.mockReset();
        mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
        mockQueryContext.mockResolvedValueOnce({
          rows: [makeRow({ context: ctx })],
        } as any);

        const result = await service.store('q', 'a', 'sess', ctx);
        expect(result.context).toBe(ctx);
      }
    });

    it('should handle mixed positive and negative emotional content', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      // 2 positive (danke, super) + 2 negative (problem, fehler) -> near-zero valence
      await service.store(
        'Danke super, aber es gibt ein Problem und einen Fehler',
        'Verstanden',
        'sess-1',
        'operations'
      );

      const insertCall = mockQueryContext.mock.calls[1];
      const valence = insertCall[2][4];
      expect(Math.abs(valence)).toBeLessThanOrEqual(0.1);
    });

    it('should cap arousal at 1.0 with many high-arousal words', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [makeRow()] } as any);

      await service.store(
        'dringend wichtig schnell sofort urgent important immediately asap critical deadline emergency',
        'OK',
        'sess-1',
        'operations'
      );

      const insertCall = mockQueryContext.mock.calls[1];
      const arousal = insertCall[2][5];
      expect(arousal).toBeLessThanOrEqual(1.0);
    });
  });

  // ===========================================
  // retrieve() — Edge Cases
  // ===========================================

  describe('retrieve — edge cases', () => {
    it('should apply both minValence and maxValence filters together', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'operations', {
        emotionalFilter: { minValence: -0.5, maxValence: 0.5 },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('emotional_valence >= $');
      expect(sql).toContain('emotional_valence <= $');
    });

    it('should apply temporal isWeekend filter', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'operations', {
        temporalFilter: { isWeekend: true },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('is_weekend = $');
    });

    it('should apply both timeOfDay and isWeekend temporal filters', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'operations', {
        temporalFilter: { timeOfDay: 'evening', isWeekend: false },
      });

      const sql = mockQueryContext.mock.calls[0][1] as string;
      expect(sql).toContain('time_of_day = $');
      expect(sql).toContain('is_weekend = $');
    });

    it('should combine emotional and temporal filters with correct param indices', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'operations', {
        emotionalFilter: { minValence: 0.2, maxValence: 0.8 },
        temporalFilter: { timeOfDay: 'morning', isWeekend: false },
      });

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      // params: context, embedding, limit, minStrength, decayRate, minValence, maxValence, timeOfDay, isWeekend
      expect(params.length).toBe(9);
      expect(params[5]).toBe(0.2);  // minValence
      expect(params[6]).toBe(0.8);  // maxValence
      expect(params[7]).toBe('morning');
      expect(params[8]).toBe(false);
    });

    it('should use default options when none provided', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-default' })],
      } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // stats update

      const results = await service.retrieve('query', 'operations');

      expect(results).toHaveLength(1);
      // default limit = 5
      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[2]).toBe(5);
    });

    it('should handle text-based fallback returning multiple results', async () => {
      mockGenerateEmbedding.mockResolvedValueOnce([]);
      mockQueryContext.mockResolvedValueOnce({
        rows: [
          makeRow({ id: 'text-1', trigger: 'matching query' }),
          makeRow({ id: 'text-2', trigger: 'also matching query' }),
        ],
      } as any);

      const results = await service.retrieve('matching query', 'operations');

      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('text-1');
    });

    it('should handle retrieve with minStrength option', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.retrieve('query', 'operations', { minStrength: 0.5 });

      const params = mockQueryContext.mock.calls[0][2] as unknown[];
      expect(params[3]).toBe(0.5);
    });
  });

  // ===========================================
  // consolidate() — Edge Cases
  // ===========================================

  describe('consolidate — edge cases', () => {
    it('should handle LLM extraction returning empty array', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 5, retrieval_strength: 0.8 })],
      } as any);
      mockExtractFacts.mockResolvedValueOnce([]);

      const result = await service.consolidate('operations');

      expect(result.episodesProcessed).toBe(1);
      expect(result.factsExtracted).toBe(0);
    });

    it('should handle LLM extraction throwing an error', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 5, retrieval_strength: 0.8 })],
      } as any);
      mockExtractFacts.mockRejectedValueOnce(new Error('LLM API rate limit'));

      const result = await service.consolidate('operations');

      // Should catch and return partial result
      expect(result.episodesProcessed).toBe(1);
      expect(result.factsExtracted).toBe(0);
    });

    it('should consolidate with metadata column using correct INSERT query', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 5, retrieval_strength: 0.9 })],
      } as any);
      mockExtractFacts.mockResolvedValueOnce([
        { fact_type: 'preference', content: 'likes dark mode', confidence: 0.9 },
      ]);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.consolidate('operations');

      const insertCall = mockQueryContext.mock.calls[2];
      const sql = insertCall[1] as string;
      expect(sql).toContain('metadata');
      // Params should include 7 values (with metadata JSON)
      expect(insertCall[2]).toHaveLength(7);
    });

    it('should consolidate without metadata column using simpler INSERT', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // no metadata column
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 5, retrieval_strength: 0.9 })],
      } as any);
      mockExtractFacts.mockResolvedValueOnce([
        { fact_type: 'behavior', content: 'asks questions at night', confidence: 0.7 },
      ]);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.consolidate('operations');

      const insertCall = mockQueryContext.mock.calls[2];
      const sql = insertCall[1] as string;
      expect(sql).not.toContain('metadata');
      expect(insertCall[2]).toHaveLength(6);
    });

    it('should handle hasMetadataColumn check failure gracefully', async () => {
      // hasMetadataColumn throws
      mockQueryContext.mockRejectedValueOnce(new Error('information_schema error'));

      const result = await service.consolidate('operations');

      // The error is caught in hasMetadataColumn which returns false,
      // then consolidate tries with hasMetadata=false and the next query also fails
      // because we don't have another mock set up - so it goes to the outer catch
      expect(result.episodesProcessed).toBe(0);
    });

    it('should process multiple facts from LLM extraction', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [{ column_name: 'metadata' }] } as any);
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ id: 'ep-1', retrieval_count: 10, retrieval_strength: 0.95 })],
      } as any);
      mockExtractFacts.mockResolvedValueOnce([
        { fact_type: 'preference', content: 'Fact A', confidence: 0.9 },
        { fact_type: 'behavior', content: 'Fact B', confidence: 0.8 },
        { fact_type: 'skill', content: 'Fact C', confidence: 0.7 },
      ]);
      // 3 INSERT calls
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.consolidate('operations');

      expect(result.factsExtracted).toBe(3);
    });
  });

  // ===========================================
  // temporalMerge() — Edge Cases
  // ===========================================

  describe('temporalMerge — edge cases', () => {
    it('should handle empty result for both weekly and monthly queries', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // weekly
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // monthly

      const result = await service.temporalMerge('operations');

      expect(result.weeklyMerged).toBe(0);
      expect(result.monthlyMerged).toBe(0);
      expect(result.episodesRemoved).toBe(0);
    });

    it('should merge multiple week groups independently', async () => {
      // 3 episodes in week 5, 3 episodes in week 6
      const episodes = [
        makeRow({ id: 'w5-1', created_at: '2026-01-27T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w5-2', created_at: '2026-01-28T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w5-3', created_at: '2026-01-29T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w6-1', created_at: '2026-02-03T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w6-2', created_at: '2026-02-04T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w6-3', created_at: '2026-02-05T10:00:00Z', retrieval_strength: 0.2 }),
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: episodes } as any); // weekly
      // 2 INSERT + 2 DELETE for two week groups
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);
      // monthly
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      const result = await service.temporalMerge('operations');

      expect(result.weeklyMerged).toBe(2);
      expect(result.episodesRemoved).toBe(6);
    });

    it('should not log when no episodes removed', async () => {
      const { logger } = require('../../../../utils/logger');
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // weekly
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // monthly

      await service.temporalMerge('operations');

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle INSERT failure during weekly merge', async () => {
      const episodes = [
        makeRow({ id: 'w1', created_at: '2026-02-01T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w2', created_at: '2026-02-02T10:00:00Z', retrieval_strength: 0.2 }),
        makeRow({ id: 'w3', created_at: '2026-02-03T10:00:00Z', retrieval_strength: 0.2 }),
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: episodes } as any);
      // INSERT summary fails
      mockQueryContext.mockRejectedValueOnce(new Error('Insert failed'));

      const result = await service.temporalMerge('operations');

      // Error is caught at top level
      expect(result.weeklyMerged).toBe(0);
    });

    it('should average emotional values in weekly summary', async () => {
      const episodes = [
        makeRow({ id: 'w1', created_at: '2026-02-01T10:00:00Z', retrieval_strength: 0.2, emotional_valence: 0.6, emotional_arousal: 0.4 }),
        makeRow({ id: 'w2', created_at: '2026-02-02T10:00:00Z', retrieval_strength: 0.3, emotional_valence: -0.2, emotional_arousal: 0.8 }),
        makeRow({ id: 'w3', created_at: '2026-02-03T10:00:00Z', retrieval_strength: 0.1, emotional_valence: 0.2, emotional_arousal: 0.3 }),
      ];

      mockQueryContext.mockResolvedValueOnce({ rows: episodes } as any);
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // INSERT
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // DELETE
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any); // monthly

      await service.temporalMerge('operations');

      const insertCall = mockQueryContext.mock.calls[1];
      const avgValence = insertCall[2][4]; // emotional_valence param
      const avgArousal = insertCall[2][5]; // emotional_arousal param
      // (0.6 + -0.2 + 0.2) / 3 = 0.2
      expect(avgValence).toBeCloseTo(0.2, 5);
      // (0.4 + 0.8 + 0.3) / 3 = 0.5
      expect(avgArousal).toBeCloseTo(0.5, 5);
    });
  });

  // ===========================================
  // applyDecay() — Edge Cases
  // ===========================================

  describe('applyDecay — edge cases', () => {
    it('should return 0 when stored procedure returns null', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ apply_episodic_decay: null }],
      } as any);

      const count = await service.applyDecay('operations');

      expect(count).toBe(0);
    });

    it('should return 0 when stored procedure returns undefined', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{}],
      } as any);

      const count = await service.applyDecay('operations');

      expect(count).toBe(0);
    });

    it('should handle fallback returning null rowCount', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('fn not found'));
      mockQueryContext.mockResolvedValueOnce({ rowCount: null } as any);

      const count = await service.applyDecay('operations');

      expect(count).toBe(0);
    });

    it('should pass correct decay rate constants to fallback query', async () => {
      mockQueryContext.mockRejectedValueOnce(new Error('fn not found'));
      mockQueryContext.mockResolvedValueOnce({ rowCount: 5 } as any);

      await service.applyDecay('finance');

      const fallbackParams = mockQueryContext.mock.calls[1][2] as unknown[];
      expect(fallbackParams[0]).toBe(0.999); // MIN_DECAY_RATE
      expect(fallbackParams[1]).toBe(0.998); // frequently retrieved rate
      expect(fallbackParams[2]).toBe(0.990); // MAX_DECAY_RATE (mundane)
      expect(fallbackParams[3]).toBe(0.995); // DECAY_RATE (default)
      expect(fallbackParams[4]).toBe('finance'); // context
    });
  });

  // ===========================================
  // getStats() — Edge Cases
  // ===========================================

  describe('getStats — edge cases', () => {
    it('should handle non-numeric string values in stats', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: 'NaN', avg_strength: 'invalid', strong: '', recent: undefined }],
      } as any);

      const stats = await service.getStats('operations');

      expect(stats.totalEpisodes).toBe(0);
      expect(stats.avgRetrievalStrength).toBe(0);
      expect(stats.strongEpisodes).toBe(0);
      expect(stats.recentEpisodes).toBe(0);
    });

    it('should handle large numbers in stats', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '999999', avg_strength: '0.9999', strong: '50000', recent: '10000' }],
      } as any);

      const stats = await service.getStats('operations');

      expect(stats.totalEpisodes).toBe(999999);
      expect(stats.avgRetrievalStrength).toBeCloseTo(0.9999);
      expect(stats.strongEpisodes).toBe(50000);
      expect(stats.recentEpisodes).toBe(10000);
    });

    it('should work across different contexts', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{ total: '10', avg_strength: '0.5', strong: '3', recent: '7' }],
      } as any);

      const stats = await service.getStats('strategy');

      expect(stats.totalEpisodes).toBe(10);
      // Verify the query was called (schema-isolated, no context param needed)
      expect(mockQueryContext).toHaveBeenCalledWith('strategy', expect.any(String));
    });
  });

  // ===========================================
  // getById() — Edge Cases
  // ===========================================

  describe('getById — edge cases', () => {
    it('should parse row with string-formatted embedding', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ embedding: '[0.1,0.2,0.3]' })],
      } as any);

      const result = await service.getById('ep-1', 'operations');

      expect(result).toBeDefined();
      expect(result!.embedding).toEqual([0.1, 0.2, 0.3]);
    });

    it('should parse row with array embedding', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ embedding: [0.4, 0.5, 0.6] })],
      } as any);

      const result = await service.getById('ep-1', 'operations');

      expect(result).toBeDefined();
      expect(result!.embedding).toEqual([0.4, 0.5, 0.6]);
    });

    it('should handle null embedding in row', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [makeRow({ embedding: null })],
      } as any);

      const result = await service.getById('ep-1', 'operations');

      expect(result).toBeDefined();
      expect(result!.embedding).toBeUndefined();
    });

    it('should parse row with missing optional fields gracefully', async () => {
      mockQueryContext.mockResolvedValueOnce({
        rows: [{
          id: 'minimal',
          context: 'operations',
          session_id: 'sess',
          trigger: 't',
          response: 'r',
          emotional_valence: null,
          emotional_arousal: null,
          time_of_day: null,
          day_of_week: null,
          is_weekend: null,
          linked_episodes: null,
          linked_facts: null,
          retrieval_count: null,
          last_retrieved: null,
          retrieval_strength: null,
          created_at: '2026-01-01T00:00:00Z',
        }],
      } as any);

      const result = await service.getById('minimal', 'operations');

      expect(result).toBeDefined();
      expect(result!.emotionalValence).toBe(0);
      expect(result!.emotionalArousal).toBe(0.5);
      expect(result!.temporalContext.timeOfDay).toBe('afternoon');
      expect(result!.temporalContext.dayOfWeek).toBe('Unknown');
      expect(result!.temporalContext.isWeekend).toBe(false);
      expect(result!.linkedEpisodes).toEqual([]);
      expect(result!.linkedFacts).toEqual([]);
      expect(result!.retrievalCount).toBe(0);
      expect(result!.retrievalStrength).toBe(1.0);
    });
  });

  // ===========================================
  // calculateEmotionalTone() — Edge Cases
  // ===========================================

  describe('calculateEmotionalTone — boundary values', () => {
    it('should handle single episode at exact boundary (valence=0.3, arousal=0.6)', () => {
      // valence == 0.3 is NOT > 0.3, so falls to neutral check
      // arousal == 0.6 is NOT > 0.6, so neutral
      const tone = service.calculateEmotionalTone([makeEpisode({ emotionalValence: 0.3, emotionalArousal: 0.6 })]);
      expect(tone.dominantMood).toBe('neutral');
    });

    it('should handle single episode just above positive boundary', () => {
      const tone = service.calculateEmotionalTone([makeEpisode({ emotionalValence: 0.31, emotionalArousal: 0.5 })]);
      expect(tone.dominantMood).toBe('positive');
    });

    it('should handle single episode just above negative boundary', () => {
      const tone = service.calculateEmotionalTone([makeEpisode({ emotionalValence: -0.31, emotionalArousal: 0.5 })]);
      expect(tone.dominantMood).toBe('negative');
    });

    it('should average correctly with many episodes', () => {
      const episodes = Array.from({ length: 100 }, (_, i) =>
        makeEpisode({
          id: `e-${i}`,
          emotionalValence: i % 2 === 0 ? 0.5 : -0.5,
          emotionalArousal: 0.5,
        })
      );

      const tone = service.calculateEmotionalTone(episodes);

      expect(tone.avgValence).toBeCloseTo(0, 5);
      expect(tone.avgArousal).toBeCloseTo(0.5, 5);
      expect(tone.dominantMood).toBe('neutral');
    });
  });

  // ===========================================
  // getBySession() — Edge Cases
  // ===========================================

  describe('getBySession — edge cases', () => {
    it('should use default limit of 10 when not specified', async () => {
      mockQueryContext.mockResolvedValueOnce({ rows: [] } as any);

      await service.getBySession('sess-1', 'operations');

      const params = mockQueryContext.mock.calls[0][2];
      expect(params[2]).toBe(10);
    });

    it('should convert multiple rows to Episode objects', async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeRow({ id: `ep-${i}`, session_id: 'sess-bulk' })
      );
      mockQueryContext.mockResolvedValueOnce({ rows } as any);

      const results = await service.getBySession('sess-bulk', 'operations', 5);

      expect(results).toHaveLength(5);
      results.forEach((ep, i) => {
        expect(ep.id).toBe(`ep-${i}`);
        expect(ep.sessionId).toBe('sess-bulk');
      });
    });
  });
});
